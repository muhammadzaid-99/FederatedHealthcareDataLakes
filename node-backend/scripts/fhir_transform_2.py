"""
fhir_transform_2.py

Spark-based transformation for the NEW schema that transforms checkups data into FHIR Bundle JSON format.

NEW SCHEMA columns:
- checkup_id (integer) - primary key
- blood_pressure (varchar)
- temperature (varchar)
- heart_rate (varchar)
- blood_sugar (varchar)
- symptoms (text)
- diagnosis (text)
- notes (text)
- insights (text)
- gap_analysis (text)
- checkup_created_at (timestamp)
- checkup_updated_at (timestamp)
- department_name (varchar)
- patient_dob (timestamp) - patient date of birth
- patient_blood_group (varchar)
- patient_medical_history (text)
- patient_allergies (text)
- patient_address (text)
- patient_gender (enum)
- prescription (jsonb) - structured medication data
- test_recommendations (jsonb) - structured lab test data

Key differences from old schema:
- Uses checkup_id instead of uuid
- Has patient demographics: dob, blood_group, medical_history, allergies, address, gender
- prescription is JSONB instead of text medications field
- test_recommendations is JSONB instead of text lab_tests field
- Has heart_rate, insights, gap_analysis, department_name
- No doctor_id, consultation_audio_url, body_weight

Usage:
    from fhir_transform_2 import transform_df_to_fhir
    df = transform_df_to_fhir(df, subject_col='checkup_id', created_at_col='checkup_created_at')
"""

from typing import List, Optional, Any
import re
import json
from datetime import datetime, timezone
import sys
import os
import logging
import traceback

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, udf, trim, when, lit, concat_ws
)
from pyspark.sql.types import StringType, ArrayType

# CLI args
staging_path = sys.argv[1]
normalized_path = sys.argv[2]

# Logger
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ETL")

# Split pattern for free-text fields
_SPLIT_RE = r"\r?\n|;|,|\|"


def _split_items_py(s: Optional[str]) -> List[str]:
    """Split free-text into list of items using multiple delimiters."""
    if s is None:
        return []
    s = s.strip()
    if s == "":
        return []
    parts = re.split(_SPLIT_RE, s)
    parts = [p.strip() for p in parts if p and p.strip()]
    return parts


_split_items_udf = udf(_split_items_py, ArrayType(StringType()))


def _parse_jsonb_to_list(val: Any) -> List[str]:
    """Parse JSONB field (prescription or test_recommendations) to list of text items."""
    if val is None:
        return []
    
    # If already a list, extract text representations
    if isinstance(val, list):
        items = []
        for item in val:
            if isinstance(item, dict):
                # Extract meaningful text from dict structure
                # Common patterns: {"name": "...", "dosage": "..."} or {"test": "...", "reason": "..."}
                name = item.get("name") or item.get("medication") or item.get("drug") or item.get("test") or item.get("testName")
                if name:
                    # Build a text representation
                    parts = [str(name)]
                    dosage = item.get("dosage") or item.get("dose")
                    frequency = item.get("frequency")
                    duration = item.get("duration")
                    reason = item.get("reason")
                    if dosage:
                        parts.append(str(dosage))
                    if frequency:
                        parts.append(str(frequency))
                    if duration:
                        parts.append(str(duration))
                    if reason:
                        parts.append(f"({reason})")
                    items.append(" ".join(parts))
                else:
                    # Fallback: convert whole dict to string
                    items.append(json.dumps(item))
            elif isinstance(item, str):
                items.append(item)
            else:
                items.append(str(item))
        return items
    
    # If it's a string, try to parse as JSON
    if isinstance(val, str):
        val = val.strip()
        if val == "" or val == "null":
            return []
        try:
            parsed = json.loads(val)
            return _parse_jsonb_to_list(parsed)
        except json.JSONDecodeError:
            # Not valid JSON, treat as plain text and split
            return _split_items_py(val)
    
    return []


_parse_jsonb_udf = udf(_parse_jsonb_to_list, ArrayType(StringType()))


def _parse_bp_py(bp_text: Optional[str]) -> Optional[str]:
    """Parse blood pressure string to JSON with systolic/diastolic."""
    if bp_text is None:
        return None
    t = bp_text.strip()
    if t == "":
        return None
    
    bp_re = re.compile(r"^(?P<syst>\d{2,3})\s*[/\\]\s*(?P<diast>\d{2,3})$")
    m = bp_re.match(t)
    if m:
        return json.dumps({
            "systolic": m.group('syst'),
            "diastolic": m.group('diast'),
            "original": t
        })
    return json.dumps({"original": t})


_parse_bp_udf = udf(_parse_bp_py, StringType())


def _build_fhir_bundle_py(
    checkup_id: Any,
    symptoms_list: List[str],
    diagnosis_list: List[str],
    notes_list: List[str],
    insights: Optional[str],
    gap_analysis: Optional[str],
    created_at: Any,
    temperature: Optional[str],
    blood_pressure: Optional[str],
    blood_sugar: Optional[str],
    heart_rate: Optional[str],
    department_name: Optional[str],
    prescription_list: List[str],
    test_list: List[str],
    patient_dob: Any,
    patient_blood_group: Optional[str],
    patient_medical_history: Optional[str],
    patient_allergies: Optional[str],
    patient_address: Optional[str],
    patient_gender: Optional[str]
) -> str:
    """Build FHIR Bundle JSON string for a checkup record."""
    
    # Format timestamp
    when_iso = None
    try:
        if created_at is not None:
            if isinstance(created_at, datetime):
                if created_at.tzinfo is None:
                    when_iso = created_at.replace(tzinfo=timezone.utc).isoformat()
                else:
                    when_iso = created_at.isoformat()
            else:
                try:
                    dt = datetime.fromisoformat(str(created_at))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    when_iso = dt.isoformat()
                except Exception:
                    when_iso = str(created_at)
    except Exception:
        when_iso = None

    # Use checkup_id as the bundle identifier
    bundle_id = str(checkup_id) if checkup_id is not None else "unknown"
    patient_id = f"Patient/patient-{bundle_id}"

    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": when_iso,
        "entry": []
    }

    # Format patient DOB
    dob_iso = None
    if patient_dob is not None:
        try:
            if isinstance(patient_dob, datetime):
                dob_iso = patient_dob.strftime("%Y-%m-%d")
            else:
                dt = datetime.fromisoformat(str(patient_dob))
                dob_iso = dt.strftime("%Y-%m-%d")
        except Exception:
            dob_iso = str(patient_dob)[:10] if patient_dob else None

    # Patient resource with demographics
    patient = {
        "resourceType": "Patient",
        "id": f"patient-{bundle_id}",
    }
    if patient_gender:
        patient["gender"] = patient_gender.lower() if patient_gender else None
    if dob_iso:
        patient["birthDate"] = dob_iso
    if patient_address:
        patient["address"] = [{"text": patient_address}]
    
    # Add extensions for blood group
    extensions = []
    if patient_blood_group:
        extensions.append({
            "url": "http://example.org/fhir/StructureDefinition/blood-group",
            "valueString": patient_blood_group
        })
    if extensions:
        patient["extension"] = extensions
    
    bundle["entry"].append({"resource": patient})

    # AllergyIntolerance resources for patient allergies
    if patient_allergies:
        allergy_items = _split_items_py(patient_allergies)
        for allergy in allergy_items:
            bundle["entry"].append({"resource": {
                "resourceType": "AllergyIntolerance",
                "patient": {"reference": patient_id},
                "clinicalStatus": {"coding": [{"code": "active"}]},
                "code": {"text": allergy}
            }})

    # Condition resources for medical history
    if patient_medical_history:
        history_items = _split_items_py(patient_medical_history)
        for history in history_items:
            bundle["entry"].append({"resource": {
                "resourceType": "Condition",
                "subject": {"reference": patient_id},
                "clinicalStatus": {"text": "resolved"},
                "category": [{"text": "Medical History"}],
                "code": {"text": history}
            }})

    # Encounter with department (FHIR R5 compliant)
    encounter = {
        "resourceType": "Encounter",
        "id": bundle_id,
        "status": "completed",
        "class": [{"coding": [{"code": "AMB", "display": "ambulatory"}]}],
        "subject": {"reference": patient_id},
    }
    # Use actualPeriod for FHIR R5 (not period)
    if when_iso:
        encounter["actualPeriod"] = {"end": when_iso}
    # Store department in type field (CodeableReference in R5) instead of serviceType
    if department_name:
        encounter["type"] = [{"coding": [{"display": department_name}]}]
    bundle["entry"].append({"resource": encounter})

    # Helper for Observation resources
    def _obs_resource(code_text: str, value_text: str, status: str = "final"):
        return {
            "resourceType": "Observation",
            "status": status,
            "code": {"text": code_text},
            "subject": {"reference": patient_id},
            "effectiveDateTime": when_iso,
            "valueString": value_text
        }

    # Vital signs
    if temperature:
        bundle["entry"].append({"resource": _obs_resource("Temperature", temperature)})

    if blood_pressure:
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

    if heart_rate:
        bundle["entry"].append({"resource": _obs_resource("Heart rate", heart_rate)})

    # Symptoms as Observations
    for s in (symptoms_list or []):
        bundle["entry"].append({"resource": _obs_resource("Symptom", s)})

    # Diagnoses as Conditions
    for d in (diagnosis_list or []):
        bundle["entry"].append({"resource": {
            "resourceType": "Condition",
            "subject": {"reference": patient_id},
            "clinicalStatus": {"text": "active"},
            "code": {"text": d}
        }})

    # Notes as DocumentReferences
    for n in (notes_list or []):
        bundle["entry"].append({"resource": {
            "resourceType": "DocumentReference",
            "type": {"text": "Clinical note"},
            "status": "current",
            "content": [{"attachment": {"title": n}}]
        }})

    # Insights as Clinical Impression
    if insights:
        bundle["entry"].append({"resource": {
            "resourceType": "ClinicalImpression",
            "status": "completed",
            "subject": {"reference": patient_id},
            "summary": insights
        }})

    # Gap Analysis as DocumentReference
    if gap_analysis:
        bundle["entry"].append({"resource": {
            "resourceType": "DocumentReference",
            "type": {"text": "Gap Analysis"},
            "status": "current",
            "content": [{"attachment": {"title": gap_analysis}}]
        }})

    # Prescriptions as MedicationRequests
    for med in (prescription_list or []):
        bundle["entry"].append({"resource": {
            "resourceType": "MedicationRequest",
            "status": "active",
            "intent": "order",
            "priority": "routine",
            "subject": {"reference": patient_id},
            "medication": {"concept": {"text": med}}
        }})

    # Test Recommendations as ServiceRequests
    test_obs_refs = []
    test_obs_resources = []
    for i, test in enumerate(test_list or []):
        obs_id = f"obs-test-{i+1}"
        obs = {
            "resourceType": "Observation",
            "id": obs_id,
            "status": "unknown",
            "code": {"text": test},
            "subject": {"reference": patient_id}
        }
        test_obs_resources.append(obs)
        test_obs_refs.append({"reference": f"Observation/{obs_id}"})

    for obs in test_obs_resources:
        bundle["entry"].append({"resource": obs})

    if test_obs_refs:
        dr = {
            "resourceType": "DiagnosticReport",
            "status": "partial",
            "code": {"text": "Recommended laboratory tests"},
            "subject": {"reference": patient_id},
            "effectiveDateTime": when_iso,
            "result": test_obs_refs
        }
        bundle["entry"].append({"resource": dr})

    # Store original data in meta extension
    bundle["meta"] = {"extension": [{
        "url": "http://example.org/fhir/StructureDefinition/original",
        "valueString": json.dumps({
            "prescription_raw": prescription_list,
            "test_recommendations_raw": test_list,
            "notes_raw": notes_list,
            "insights_raw": insights,
            "gap_analysis_raw": gap_analysis,
            "patient_medical_history_raw": patient_medical_history,
            "patient_allergies_raw": patient_allergies
        })
    }]}

    return json.dumps(bundle, default=str)


_build_fhir_bundle_udf = udf(_build_fhir_bundle_py, StringType())


def transform_df_to_fhir(df: DataFrame, subject_col: str = "checkup_id", created_at_col: str = "checkup_created_at") -> DataFrame:
    """
    Transform DataFrame to include FHIR bundle and normalized columns.
    
    Expected columns (new schema):
    - checkup_id, blood_pressure, temperature, heart_rate, blood_sugar
    - symptoms, diagnosis, notes, insights, gap_analysis
    - checkup_created_at, checkup_updated_at, department_name
    - patient_dob, patient_blood_group, patient_medical_history
    - patient_allergies, patient_address, patient_gender
    - prescription (JSONB), test_recommendations (JSONB)
    """
    
    # Trim text columns
    text_cols = [
        "symptoms", "diagnosis", "notes", "insights", "gap_analysis",
        "temperature", "blood_pressure", "blood_sugar", "heart_rate",
        "department_name", "patient_blood_group", "patient_medical_history",
        "patient_allergies", "patient_address", "patient_gender"
    ]
    for c in text_cols:
        if c in df.columns:
            df = df.withColumn(c, trim(col(c)))

    # Ensure department_name is never null/empty for partitioning - default to 'unassigned'
    if "department_name" in df.columns:
        df = df.withColumn(
            "department_name",
            when((col("department_name").isNull()) | (col("department_name") == ""), lit("unassigned"))
            .otherwise(col("department_name"))
        )
    else:
        df = df.withColumn("department_name", lit("unassigned"))

    # Parse JSONB fields to lists
    if "prescription" in df.columns:
        df = df.withColumn("prescription_list", _parse_jsonb_udf(col("prescription")))
    else:
        df = df.withColumn("prescription_list", lit(None).cast(ArrayType(StringType())))

    if "test_recommendations" in df.columns:
        df = df.withColumn("test_list", _parse_jsonb_udf(col("test_recommendations")))
    else:
        df = df.withColumn("test_list", lit(None).cast(ArrayType(StringType())))

    # Split free-text fields
    for src, dest in [("symptoms", "symptom_list"), ("diagnosis", "diagnosis_list"), ("notes", "note_list")]:
        if src in df.columns:
            df = df.withColumn(dest, _split_items_udf(col(src)))
        else:
            df = df.withColumn(dest, lit(None).cast(ArrayType(StringType())))

    # Parse BP
    if "blood_pressure" in df.columns:
        df = df.withColumn("bp_parsed", _parse_bp_udf(col("blood_pressure")))
    else:
        df = df.withColumn("bp_parsed", lit(None))

    # Build FHIR bundle
    df = df.withColumn(
        "fhir_bundle_json",
        _build_fhir_bundle_udf(
            col(subject_col),
            col("symptom_list"),
            col("diagnosis_list"),
            col("note_list"),
            col("insights") if "insights" in df.columns else lit(None),
            col("gap_analysis") if "gap_analysis" in df.columns else lit(None),
            col(created_at_col),
            col("temperature") if "temperature" in df.columns else lit(None),
            col("blood_pressure") if "blood_pressure" in df.columns else lit(None),
            col("blood_sugar") if "blood_sugar" in df.columns else lit(None),
            col("heart_rate") if "heart_rate" in df.columns else lit(None),
            col("department_name") if "department_name" in df.columns else lit(None),
            col("prescription_list"),
            col("test_list"),
            col("patient_dob") if "patient_dob" in df.columns else lit(None),
            col("patient_blood_group") if "patient_blood_group" in df.columns else lit(None),
            col("patient_medical_history") if "patient_medical_history" in df.columns else lit(None),
            col("patient_allergies") if "patient_allergies" in df.columns else lit(None),
            col("patient_address") if "patient_address" in df.columns else lit(None),
            col("patient_gender") if "patient_gender" in df.columns else lit(None)
        )
    )

    # Create summary columns
    df = df.withColumn("prescription_summary", concat_ws("; ", col("prescription_list")))
    df = df.withColumn("test_summary", concat_ws("; ", col("test_list")))

    return df


if __name__ == "__main__":
    result = {"success": None, "message": None}
    try:
        logger.info("Normalize Job Start (fhir_transform_2)")
        spark = SparkSession.builder.appName("NormalizeStaging_v2").getOrCreate()
        parq_dir = os.path.abspath(staging_path)
        logger.info(f"Parquet Directory: {parq_dir}")
        df = spark.read.parquet(parq_dir)
        df_norm = transform_df_to_fhir(df, subject_col="checkup_id", created_at_col="checkup_created_at")
        df_norm.write.mode("overwrite").option("compression", "snappy").parquet(normalized_path)
        spark.stop()
        result["success"] = True
        result["message"] = "Normalization completed successfully."
    except Exception as e:
        result["success"] = False
        result["message"] = f"Error: {str(e)}\n{traceback.format_exc()}"
    print(json.dumps(result))
