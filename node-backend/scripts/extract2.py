import os
import sys
import time
import logging
import json
import uuid
from pyspark.sql import SparkSession
from datetime import datetime
import boto3
from botocore.exceptions import ClientError
# from fhir_transform import transform_df_to_fhir
from fhir.resources.bundle import Bundle
from pydantic import ValidationError
import hashlib
from typing import Tuple
import pandas as pd


# ------------------- ARGS -------------------
start_date_str = sys.argv[1]
end_date_str = sys.argv[2]


# print(f"Python executable path: {sys.executable}")

# if os.environ.get('VIRTUAL_ENV'):
#     print(f"Virtual environment is active at: {os.environ.get('VIRTUAL_ENV')}")
# else:
#     print("Not running in a virtual environment.")

# Get the current working directory
# current_working_directory = os.getcwd()

# Print the directory
# print(f"The current working directory is: {current_working_directory}")

#  Ensure Spark uses correct Python executable
# os.environ["PYSPARK_PYTHON"] = "python"
# os.environ["PYSPARK_DRIVER_PYTHON"] = "python"


# ------------------- CONFIG -------------------
# Read from environment variables (set by Go backend) - REQUIRED, no defaults
REQUIRED_ENV_VARS = {
    "JDBC_URL": os.environ.get("JDBC_URL"),
    "DB_TABLE": os.environ.get("DB_TABLE"),
    "DB_USER": os.environ.get("DB_USER"),
    "DB_PASSWORD": os.environ.get("DB_PASSWORD"),
    "JDBC_DRIVER_PATH": os.environ.get("JDBC_DRIVER_PATH"),
    "OUTPUT_DIR": os.environ.get("OUTPUT_DIR"),
    "MINIO_ENDPOINT": os.environ.get("MINIO_ENDPOINT"),
    "MINIO_ACCESS_KEY": os.environ.get("MINIO_ACCESS_KEY"),
    "MINIO_SECRET_KEY": os.environ.get("MINIO_SECRET_KEY"),
    "BUCKET_NAME": os.environ.get("BUCKET_NAME"),
}

# Fail fast if any required env var is missing or empty
missing_vars = [name for name, value in REQUIRED_ENV_VARS.items() if not value]
if missing_vars:
    error_msg = f"Missing or empty required environment variables: {', '.join(missing_vars)}"
    print(json.dumps({"success": False, "message": error_msg}), flush=True)
    sys.exit(1)

# Assign to constants after validation
JDBC_URL = REQUIRED_ENV_VARS["JDBC_URL"]
DB_TABLE = REQUIRED_ENV_VARS["DB_TABLE"]
DB_USER = REQUIRED_ENV_VARS["DB_USER"]
DB_PASSWORD = REQUIRED_ENV_VARS["DB_PASSWORD"]
JDBC_DRIVER_PATH = REQUIRED_ENV_VARS["JDBC_DRIVER_PATH"]
OUTPUT_DIR = REQUIRED_ENV_VARS["OUTPUT_DIR"]
MINIO_ENDPOINT = REQUIRED_ENV_VARS["MINIO_ENDPOINT"]
MINIO_ACCESS_KEY = REQUIRED_ENV_VARS["MINIO_ACCESS_KEY"]
MINIO_SECRET_KEY = REQUIRED_ENV_VARS["MINIO_SECRET_KEY"]
BUCKET_NAME = REQUIRED_ENV_VARS["BUCKET_NAME"]
DEPARTMENTS = ["cardiology", "neurology"]
ENRICHMENT_VERSION = "v1"  # bump this when enrichment logic changes

# ------------------- LOGGER -------------------
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ETL")

# ------------------- SPARK -------------------
# def run_spark_etl(start, end):
#     spark = SparkSession.builder \
#         .appName("PostgresToParquetExtract") \
#         .config("spark.jars", JDBC_DRIVER_PATH) \
#         .getOrCreate()

#     logger.info("Spark session created.")

#     where_clause = f"updated_at > timestamp '{start}' and updated_at < timestamp '{end}'"

#     df = spark.read \
#         .format("jdbc") \
#         .option("url", JDBC_URL) \
#         .option("dbtable", f"(SELECT * FROM {DB_TABLE} WHERE {where_clause}) AS filtered") \
#         .option("user", DB_USER) \
#         .option("password", DB_PASSWORD) \
#         .option("driver", "org.postgresql.Driver") \
#         .load()

#     if df.rdd.isEmpty():
#         logger.info("No records found.")
#         spark.stop()
#         return None

#     timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
#     out_path = f"{OUTPUT_DIR}/staging/{DB_TABLE}_{timestamp_str}"
#     df.write.mode("overwrite").parquet(out_path)

#     logger.info(f"Data written locally: {out_path}")
#     spark.stop()
#     return out_path

def run_spark_etl(start, end, single_file=False, coalesce_num=1):
    spark = None
    try:
        spark = SparkSession.builder \
            .appName("PostgresToParquetExtract") \
            .config("spark.jars", JDBC_DRIVER_PATH) \
            .getOrCreate()
        logger.info("Spark session created.")

        where_clause = f"created_at > timestamp '{start}' and created_at < timestamp '{end}'"

        df = spark.read \
            .format("jdbc") \
            .option("url", JDBC_URL) \
            .option("dbtable", f"(SELECT * FROM {DB_TABLE} WHERE {where_clause}) AS filtered") \
            .option("user", DB_USER) \
            .option("password", DB_PASSWORD) \
            .option("driver", "org.postgresql.Driver") \
            .option("fetchsize", "10000") \
            .load()

        # faster/cleaner empty check
        if not df.head(1):
            logger.info("No records found.")
            return None

        # --- TRANSFORM: normalize & add fhir_bundle_json column BEFORE writing staging ---
        # import your transformer (ensure this file is on PYTHONPATH)
        # from fhir_transform import transform_df_to_fhir  # must exist
        logger.info("Success: Spark Data Extraction from Database")
        # df_norm = transform_df_to_fhir(df, subject_col='uuid', created_at_col='created_at')
        df_norm = df

        # Optionally reduce to single file for easy upload (ONLY for small batches)
        timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        out_path = f"{OUTPUT_DIR}/staging/{DB_TABLE}_{timestamp_str}"
        write_df = df_norm
        if single_file:
            write_df = df_norm.coalesce(coalesce_num)

        # write parquet with compression
        write_df.write.mode("overwrite").option("compression", "snappy").parquet(out_path)
        logger.info(f"Extracted staging Parquet written locally: {out_path}")

        return out_path

    except Exception as exc:
        logger.exception("Error in run_spark_etl: %s", exc)
        raise
    finally:
        if spark:
            spark.stop()
            logger.info("Spark session stopped.")


# ------------------- MINIO -------------------
def upload_to_minio(local_path, start, end):
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )

    # Ensure bucket exists
    try:
        s3.head_bucket(Bucket=BUCKET_NAME)
    except ClientError:
        s3.create_bucket(Bucket=BUCKET_NAME)

    # Find parquet file
    parquet_file = [f for f in os.listdir(local_path) if f.endswith(".parquet")][0]
    local_file = os.path.join(local_path, parquet_file)

    for dept in DEPARTMENTS:
        key = f"{dept}/checkups_{start}_{end}.parquet"
        s3.upload_file(local_file, BUCKET_NAME, key)
        logger.info(f"Uploaded {key} to MinIO.")

# ---------------- HELPERS -------------------
def deterministic_id(seed: str) -> str:
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()

def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=BUCKET_NAME)
    except ClientError:
        s3.create_bucket(Bucket=BUCKET_NAME)

def read_staging_parquet(local_path: str) -> pd.DataFrame:
    # assumes there's exactly one parquet file (like your current code)
    pfiles = [f for f in os.listdir(local_path) if f.endswith(".parquet")]
    if not pfiles:
        raise FileNotFoundError("no parquet found in staging path: " + local_path)
    pf = os.path.join(local_path, pfiles[0])
    # read with pandas (pyarrow)
    df = pd.read_parquet(pf)
    return df

def write_parquet(df: pd.DataFrame, out_dir: str, fname: str):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, fname)
    df.to_parquet(path, index=False)
    return path

def upload_file(s3, local_file: str, key: str):
    s3.upload_file(local_file, BUCKET_NAME, key)
    return f"s3://{BUCKET_NAME}/{key}"

def commit_run(s3, tmp_prefix: str, final_prefix: str):
    """
    Copy objects from tmp_prefix to final_prefix and write _SUCCESS marker.
    tmp_prefix and final_prefix are keys without bucket, e.g. 'fhir/validated/_tmp/run-123/'
    """
    # list objects under tmp_prefix
    resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=tmp_prefix)
    if "Contents" not in resp:
        raise RuntimeError("no objects in tmp prefix: " + tmp_prefix)
    for obj in resp["Contents"]:
        src_key = obj["Key"]
        filename = src_key.split(tmp_prefix, 1)[-1]
        dest_key = final_prefix.rstrip("/") + "/" + filename
        copy_source = {"Bucket": BUCKET_NAME, "Key": src_key}
        s3.copy_object(Bucket=BUCKET_NAME, CopySource=copy_source, Key=dest_key)

    # Write a manifest / success marker
    success_key = final_prefix.rstrip("/") + "/_SUCCESS"
    s3.put_object(Bucket=BUCKET_NAME, Key=success_key, Body=b"")
    # (optionally) delete tmp objects
    for obj in resp["Contents"]:
        s3.delete_object(Bucket=BUCKET_NAME, Key=obj["Key"])

# -------------------- FHIR -------------------
def validate_bundles_df(df: pd.DataFrame, enrichment_version: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Input: DataFrame with column `fhir_bundle_json` (string), and at least `uuid`
    Output: two DataFrames: validated_df, errors_df
    Both DataFrames include new columns: fhir_validation_status, enrichment_version, validated_at, fhir_bundle_json (possibly updated)
    """
    validated_rows = []
    error_rows = []

    for idx, row in df.iterrows():
        bjson = row.get("fhir_bundle_json")
        uid = str(row.get("uuid") or str(uuid.uuid4()))
        now_iso = datetime.utcnow().isoformat() + "Z"
        meta = {
            "fhir_validation_status": None,
            "enrichment_version": enrichment_version,
            "validated_at": now_iso,
            "validation_error": None
        }

        if not bjson:
            meta["fhir_validation_status"] = "INVALID"
            meta["validation_error"] = "missing fhir_bundle_json"
            row_out = row.copy()
            for k, v in meta.items():
                row_out[k] = v
            error_rows.append(row_out)
            continue

        try:
            # parse JSON string -> dict
            if isinstance(bjson, str):
                bundle_dict = json.loads(bjson)
            else:
                bundle_dict = bjson  # assume already dict-like

            # ensure Bundle.id exists deterministically
            if not bundle_dict.get("id"):
                bundle_id = "bundle-" + deterministic_id(uid + enrichment_version)
                bundle_dict["id"] = bundle_id

            # Optionally set deterministic ids for some nested resources (Patient/Encounter) if missing
            # e.g., patient id = uuid
            entries = bundle_dict.get("entry", [])
            for e in entries:
                r = e.get("resource", {})
                if r.get("resourceType") == "Patient" and not r.get("id"):
                    r["id"] = uid
                if r.get("resourceType") == "Encounter" and not r.get("id"):
                    r["id"] = uid

            # Validate via fhir.resources (Pydantic)
            Bundle.parse_obj(bundle_dict)  # raises ValidationError if invalid

            # store updated bundle JSON back to row (canonicalized)
            row_out = row.copy()
            row_out["fhir_bundle_json"] = json.dumps(bundle_dict, default=str)
            row_out["fhir_validation_status"] = "VALID"
            row_out["enrichment_version"] = enrichment_version
            row_out["validated_at"] = now_iso
            validated_rows.append(row_out)
        except (ValidationError, json.JSONDecodeError) as e:
            row_out = row.copy()
            row_out["fhir_bundle_json"] = bjson  # keep original
            row_out["fhir_validation_status"] = "INVALID"
            row_out["enrichment_version"] = enrichment_version
            row_out["validated_at"] = now_iso
            row_out["validation_error"] = str(e)
            error_rows.append(row_out)

    if validated_rows:
        validated_df = pd.DataFrame(validated_rows)
    else:
        validated_df = pd.DataFrame(columns=list(df.columns) + ["fhir_validation_status","enrichment_version","validated_at","validation_error"])

    if error_rows:
        errors_df = pd.DataFrame(error_rows)
    else:
        errors_df = pd.DataFrame(columns=list(df.columns) + ["fhir_validation_status","enrichment_version","validated_at","validation_error"])

    return validated_df, errors_df

def enrich_validate_and_publish(local_path: str, start: str, end: str):
    """
    Main entry: read staging parquet (local), validate bundles, write validated/errors parquet locally,
    upload validated to MinIO tmp, commit to final on success, upload errors to errors prefix.
    """
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )
    ensure_bucket(s3)

    run_id = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ-") + str(uuid.uuid4())[:8]
    tmp_valid_prefix = f"fhir/validated/_tmp/run-{run_id}/"
    final_valid_prefix = f"fhir/validated/date={start}/"  # example final layout
    tmp_error_prefix = f"fhir/errors/_tmp/run-{run_id}/"
    final_error_prefix = f"fhir/errors/date={start}/"

    df = read_staging_parquet(local_path)
    validated_df, errors_df = validate_bundles_df(df, ENRICHMENT_VERSION)

    # write local parquet outputs
    out_dir = os.path.join(local_path, "fhir_outputs")
    os.makedirs(out_dir, exist_ok=True)
    validated_path = None
    errors_path = None
    if not validated_df.empty:
        validated_path = write_parquet(validated_df, out_dir, f"validated_{start}_{end}.parquet")
    if not errors_df.empty:
        errors_path = write_parquet(errors_df, out_dir, f"errors_{start}_{end}.parquet")

    # upload validated parquet(s) to tmp prefix and errors to tmp error prefix
    if validated_path:
        # for each dept key logic preserved
        for dept in DEPARTMENTS:
            key = f"{dept}/{tmp_valid_prefix}validated_{start}_{end}.parquet"
            upload_file(s3, validated_path, key)

    if errors_path:
        for dept in DEPARTMENTS:
            key = f"{dept}/{tmp_error_prefix}errors_{start}_{end}.parquet"
            upload_file(s3, errors_path, key)

    # commit validated run (copy tmp -> final and write _SUCCESS) only if validated exists
    if validated_path:
        for dept in DEPARTMENTS:
            tmp_pref = f"{dept}/{tmp_valid_prefix}"
            final_pref = f"{dept}/{final_valid_prefix}"
            commit_run(s3, tmp_pref, final_pref)
    # Always copy errors tmp to final errors (do not commit with _SUCCESS)
    if errors_path:
        for dept in DEPARTMENTS:
            tmp_pref = f"{dept}/{tmp_error_prefix}"
            final_pref = f"{dept}/{final_error_prefix}"
            # copy without _SUCCESS marker (errors are for manual review)
            resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=tmp_pref)
            if "Contents" in resp:
                for obj in resp["Contents"]:
                    src_key = obj["Key"]
                    filename = src_key.split(tmp_pref, 1)[-1]
                    dest_key = final_pref.rstrip("/") + "/" + filename
                    copy_source = {"Bucket": BUCKET_NAME, "Key": src_key}
                    s3.copy_object(Bucket=BUCKET_NAME, CopySource=copy_source, Key=dest_key)
                # delete tmp error objects
                for obj in resp["Contents"]:
                    s3.delete_object(Bucket=BUCKET_NAME, Key=obj["Key"])

    return {
        "run_id": run_id,
        "validated_path": validated_path,
        "errors_path": errors_path
    }

# ------------------- MAIN -------------------
# if __name__ == "__main__":
#     t0 = time.time()
#     local_path = run_spark_etl(start_date_str, end_date_str)
#     if local_path:
#         upload_to_minio(local_path, start_date_str, end_date_str)
#     logger.info(f"ETL finished in {time.time()-t0:.2f}s")


if __name__ == "__main__":
    t0 = time.time()
    local_path = run_spark_etl(start_date_str, end_date_str)
    result = {
        "status": "OK",
        "staging_path": local_path
    }
    print(json.dumps(result, default=str))
    
    # if local_path:
    #     # Instead of immediate upload, run enrichment+validation then publish validated bundles
    #     # from enrich_and_publish import enrich_validate_and_publish
    #     result = enrich_validate_and_publish(local_path, start_date_str, end_date_str)
    #     # result contains run_id, paths etc.
    # logger.info(f"ETL finished in {time.time()-t0:.2f}s")
