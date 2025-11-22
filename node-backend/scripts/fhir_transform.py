"""
fhir_transform.py

Contains Spark-friendly helpers to transform your `checkups` DataFrame into a
simple FHIR Bundle JSON (as a string) and useful normalized columns.

Design goals (per your specs):
- Accept free-text inputs; split meds/labs/symptoms/diagnosis/notes by newline, semicolon, or comma
- Keep vitals (temperature, blood_pressure, blood_sugar, body_weight) as entered (no unit normalization)
- Produce intermediate normalized arrays (med_list, lab_list, symptom_list, diagnosis_list, note_list)
- Produce a `fhir_bundle_json` column containing a lightweight FHIR Bundle (collection) using `text` fields only
- Keep original raw fields for audit

Usage (in your existing Spark job):
    from fhir_transform import transform_df_to_fhir
    df = transform_df_to_fhir(df, subject_col='uuid', created_at_col='created_at')

Then continue to write `df` to parquet as you already do.

This module purposely avoids external FHIR libs so it runs wherever PySpark runs.
It is conservative: stores free text in `code.text` / `medicationCodeableConcept.text` etc.
Later you can enrich `fhir_bundle_json` with codings.

"""
from typing import List, Optional
import re
import json
from datetime import datetime
import sys
import os
import logging

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, udf, regexp_replace, trim, when, lit, to_json, struct, concat_ws
)
from pyspark.sql.types import StringType, ArrayType
import traceback


staging_path = sys.argv[1]
normalized_path = sys.argv[2]

# ------------------- LOGGER -------------------
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ETL")

# ---------- Simple normalizer & splitter (consistent across fields) ----------
_SPLIT_RE = r"\r?\n|;|,|\|"  # newline, semicolon, comma, pipe

def _normalize_text(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s2 = s.strip()
    if s2 == "":
        return None
    # collapse repeated whitespace
    s2 = re.sub(r"\s+", " ", s2)
    return s2

# UDF: split free-text into list of items using multiple delimiters and preserve original trimmed tokens
def _split_items_py(s: Optional[str]) -> List[str]:
    if s is None:
        return []
    # unify windows newlines, remove leading/trailing whitespace
    s = s.strip()
    if s == "":
        return []
    parts = re.split(_SPLIT_RE, s)
    parts = [p.strip() for p in parts if p and p.strip()]
    return parts

_split_items_udf = udf(_split_items_py, ArrayType(StringType()))

# ---------- Vitals parsing helpers (best-effort, but keep original text) ----------
# For blood_pressure, try to split "120/80" into systolic/diastolic, otherwise keep string
_BP_RE = re.compile(r"^(?P<syst>\d{2,3})\s*[/\\]\s*(?P<diast>\d{2,3})$")

def _parse_bp_py(bp_text: Optional[str]):
    # returns "systolic/diastolic" dict or original text
    if bp_text is None:
        return None
    t = bp_text.strip()
    if t == "":
        return None
    m = _BP_RE.match(t)
    if m:
        return json.dumps({
            "systolic": m.group('syst'),
            "diastolic": m.group('diast'),
            "original": t
        })
    # fallback: keep full text
    return json.dumps({"original": t})

_parse_bp_udf = udf(_parse_bp_py, StringType())

# ---------- FHIR bundle builder (returns JSON string) ----------
# This builds a conservative Bundle using text fields only. Each row -> one Bundle.
# The bundle contains: Patient (minimal), Encounter, Observations (vitals), MedicationStatements, DiagnosticReport (labs), DocumentReference (audio)

def _build_fhir_bundle_py(
    uuid, doctor_id, patient_name, patient_age, patient_gender,
    symptoms_list, diagnosis_list, notes_list,
    consultation_audio_url, created_at,
    temperature, blood_pressure, blood_sugar, body_weight,
    med_list, lab_list
):
    # keep timestamp as ISO if possible
    when_iso = None
    try:
        if created_at is not None:
            # created_at might already be a string; attempt parse or fallback to str
            # Try to parse to ISO8601, fallback to str
            if isinstance(created_at, datetime):
                # Ensure timezone-aware; if naive, assume UTC
                if created_at.tzinfo is None:
                    when_iso = created_at.replace(tzinfo=datetime.timezone.utc).isoformat()
                else:
                    when_iso = created_at.isoformat()
            else:
                try:
                    # Try parsing common datetime string formats
                    dt = datetime.fromisoformat(str(created_at))
                    # Ensure timezone-aware; if naive, assume UTC
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=datetime.timezone.utc)
                    when_iso = dt.isoformat()
                except Exception:
                    when_iso = str(created_at)
    except Exception:
        when_iso = None

    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": when_iso,
        "entry": []
    }

    # Patient (minimal)
    patient_id = f"Patient/{uuid}" if uuid is not None else None
    patient = {
        "resourceType": "Patient",
        "id": f"{uuid}",
        "name": [{"text": patient_name}] if patient_name else None,
        "gender": patient_gender if patient_gender else None,
        # Age: store as extension-like element because birthDate unknown
        "extension": [{"url": "http://example.org/fhir/StructureDefinition/age", "valueString": str(patient_age)}] if patient_age else None
    }
    bundle["entry"].append({"resource": patient})

    # Encounter (minimal)
    encounter = {
        "resourceType": "Encounter",
        "id": uuid,
        "status": "finished",
        "subject": {"reference": patient_id} if patient_id else None,
        "participant": [{"actor": {"reference": f"Practitioner/{doctor_id}"}}] if doctor_id else None,
        "location":[{"period": {"end": when_iso}}] if when_iso else None,
        # here end is used to show when checkup was ended
        # "reasonReference": [{"display": ", ".join(diagnosis_list)}] if diagnosis_list else None
    }
    bundle["entry"].append({"resource": encounter})

    # Observations for vitals (store as code.text and valueString when unit/number not parsed)
    def _obs_resource(code_text, value_text):
        return {
            "resourceType": "Observation",
            "status": "final",
            "code": {"text": code_text},
            "subject": {"reference": patient_id} if patient_id else None,
            "effectiveDateTime": when_iso,
            "valueString": value_text,
            "status": "final"
        }

    if temperature:
        bundle["entry"].append({"resource": _obs_resource("Temperature", temperature)})

    if blood_pressure:
        # try split if possible
        bp_json = None
        try:
            bp_json = json.loads(_parse_bp_py(blood_pressure))
        except Exception:
            bp_json = {"original": blood_pressure}
        if bp_json and "systolic" in bp_json:
            bundle["entry"].append({"resource": _obs_resource("Systolic blood pressure", bp_json.get('systolic'))})
            bundle["entry"].append({"resource": _obs_resource("Diastolic blood pressure", bp_json.get('diastolic'))})
        else:
            bundle["entry"].append({"resource": _obs_resource("Blood pressure", blood_pressure)})

    if blood_sugar:
        bundle["entry"].append({"resource": _obs_resource("Blood sugar", blood_sugar)})

    if body_weight:
        bundle["entry"].append({"resource": _obs_resource("Body weight", body_weight)})

    # Symptoms/Diagnosis/Notes -> treat as Observations or Conditions (we store as text Observations here)
    for s in (symptoms_list or []):
        bundle["entry"].append({"resource": _obs_resource("Symptom", s)})
    for d in (diagnosis_list or []):
        bundle["entry"].append({"resource": {"resourceType": "Condition", "subject": {"reference": patient_id}, "clinicalStatus": {"text": "active"}, "code": {"text": d}}})
    for n in (notes_list or []):
        bundle["entry"].append({"resource": {"resourceType": "DocumentReference", "type": {"text": "Clinical note"}, "status":"current", "content": [{"attachment": {"data": None, "title": n}}]}})

    # MedicationStatements
    for m in (med_list or []):
        # bundle["entry"].append({"resource": {
        #     "resourceType": "MedicationStatement",
        #     "status": "active",
        #     "subject": {"reference": patient_id},
        #     "medicationCodeableConcept": {"text": m}
        # }})
        bundle["entry"].append({"resource": {
            "resourceType": "MedicationRequest",
            "status": "active", # maybe unknown is better
            "intent":"order",
            "priority":"routine",
            "subject": {"reference": patient_id},
            "medication": {"concept": {"text":m}}
        }})

    # Recommended lab tests: create Observations with code.text = lab name, and a DiagnosticReport referencing them
    lab_obs_refs = []
    lab_obs_resources = []
    for lab in (lab_list or []):
        obs_id = f"obs-{len(lab_obs_resources)+1}"
        obs = {
            "resourceType": "Observation",
            "id": obs_id,
            "status": "unknown",
            "code": {"text": lab},
            "subject": {"reference": patient_id}
        }
        lab_obs_resources.append(obs)
        lab_obs_refs.append({"reference": f"Observation/{obs_id}"})

    for obs in lab_obs_resources:
        bundle["entry"].append({"resource": obs})

    if lab_obs_refs:
        dr = {
            "resourceType": "DiagnosticReport",
            "status": "partial",
            "code": {"text": "Requested laboratory tests"},
            "subject": {"reference": patient_id},
            "effectiveDateTime": when_iso,
            "result": lab_obs_refs
        }
        bundle["entry"].append({"resource": dr})

    # DocumentReference for consultation audio
    if consultation_audio_url:
        doc = {
            "resourceType": "DocumentReference",
            "status": "current",
            "type": {"text": "Consultation audio"},
            "content": [{"attachment": {"url": consultation_audio_url}}],
            "subject": {"reference": patient_id}
        }
        bundle["entry"].append({"resource": doc})

    # Keep original raw values under 'raw' to aid future enrichment
    # bundle["meta"] = {"original": {"medications_raw": med_list, "lab_tests_raw": lab_list, "notes_raw": notes_list}}
    bundle["meta"] = {"extension": [{
        "url":"http://example.org/fhir/StructureDefinition/original",
        "valueString":json.dumps({"medications_raw": med_list, "lab_tests_raw": lab_list, "notes_raw": notes_list})
    }]}

    return json.dumps(bundle, default=str)

_build_fhir_bundle_udf = udf(_build_fhir_bundle_py, StringType())

# ---------- Public API: transform_df_to_fhir ----------

def transform_df_to_fhir(df: DataFrame, subject_col: str = "uuid", created_at_col: str = "created_at") -> DataFrame:
    """Transforms input DataFrame in-place (returns new DataFrame) adding these columns:
    - med_list (array<string>)
    - lab_list (array<string>)
    - symptom_list (array<string>)
    - diagnosis_list (array<string>)
    - note_list (array<string>)
    - bp_parsed (json string with systolic/diastolic/original)
    - fhir_bundle_json (string) -> canonical bundle per row

    The function expects the input df to have columns named like in your schema:
    uuid, doctor_id, patient_name, patient_age, patient_gender, symptoms, diagnosis, notes,
    consultation_audio_url, created_at, temperature, blood_pressure, blood_sugar, medications, lab_tests, body_weight
    """
    # normalize string columns first (safe guards)
    text_cols = [
        "patient_name", "patient_age", "patient_gender", "symptoms", "diagnosis",
        "notes", "consultation_audio_url", "temperature", "blood_pressure",
        "blood_sugar", "medications", "lab_tests", "body_weight"
    ]
    for c in text_cols:
        if c in df.columns:
            df = df.withColumn(c, trim(col(c)))

    # split free-text fields into arrays
    if "medications" in df.columns:
        df = df.withColumn("med_list", _split_items_udf(col("medications")))
    else:
        df = df.withColumn("med_list", lit(None).cast(ArrayType(StringType())))

    if "lab_tests" in df.columns:
        df = df.withColumn("lab_list", _split_items_udf(col("lab_tests")))
    else:
        df = df.withColumn("lab_list", lit(None).cast(ArrayType(StringType())))

    for src, dest in [("symptoms", "symptom_list"), ("diagnosis", "diagnosis_list"), ("notes", "note_list")]:
        if src in df.columns:
            df = df.withColumn(dest, _split_items_udf(col(src)))
        else:
            df = df.withColumn(dest, lit(None).cast(ArrayType(StringType())))

    # parse BP best-effort
    if "blood_pressure" in df.columns:
        df = df.withColumn("bp_parsed", _parse_bp_udf(col("blood_pressure")))
    else:
        df = df.withColumn("bp_parsed", lit(None))

    # Build FHIR bundle JSON string per row
    df = df.withColumn(
        "fhir_bundle_json",
        _build_fhir_bundle_udf(
            col(subject_col), col("doctor_id"), col("patient_name"), col("patient_age"), col("patient_gender"),
            col("symptom_list"), col("diagnosis_list"), col("note_list"),
            col("consultation_audio_url"), col(created_at_col),
            col("temperature"), col("blood_pressure"), col("blood_sugar"), col("body_weight"),
            col("med_list"), col("lab_list")
        )
    )

    # Optionally create a small human-friendly columns to ease debugging: med_summary, lab_summary
    df = df.withColumn("med_summary", concat_ws("; ", col("med_list")))
    df = df.withColumn("lab_summary", concat_ws("; ", col("lab_list")))

    return df


if __name__ == "__main__":
    result = {"success": None, "message": None}
    try:
        logger.info("Normalize Job Start")
        spark = SparkSession.builder.appName("NormalizeStaging").getOrCreate()
        parq_dir = os.path.abspath(staging_path)
        logger.info(f"Parquet Directory: {parq_dir}")
        df = spark.read.parquet(parq_dir)
        df_norm = transform_df_to_fhir(df, subject_col="id")
        df_norm.write.mode("overwrite").option("compression", "snappy").parquet(normalized_path)
        spark.stop()
        result["success"] = True
        result["message"] = "Normalization completed successfully."
    except Exception as e:
        result["success"] = False
        result["message"] = f"Error: {str(e)}\n{traceback.format_exc()}"
    print(json.dumps(result))