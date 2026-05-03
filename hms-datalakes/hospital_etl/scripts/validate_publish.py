import os
import sys
import time
import logging
import json
import uuid
import re
from pyspark.sql import SparkSession, DataFrame, Row
from pyspark.sql.types import StructType, StructField, StringType
from pyspark.sql.functions import lit, current_timestamp, date_format
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
# from fhir_transform import transform_df_to_fhir
from fhir.resources.bundle import Bundle
from pydantic import ValidationError
import hashlib
from typing import Iterator, Dict, Any, Tuple, List
import pandas as pd
import traceback


# ------------------- ARGS -------------------
start_date_str = sys.argv[1]
end_date_str = sys.argv[2]
local_path = sys.argv[3]
output_path = sys.argv[4]

# ------------------- CONFIG -------------------
JDBC_URL = "jdbc:postgresql://localhost:5432/hms"
DB_TABLE = "checkups"
DB_USER = "postgres"
DB_PASSWORD = "12345678"
JDBC_DRIVER_FILENAME = "postgresql-42.7.7.jar"
JDBC_DRIVER_PATH = os.path.abspath(JDBC_DRIVER_FILENAME)

OUTPUT_DIR = os.path.abspath("parquet")

MINIO_ENDPOINT = "http://localhost:9000"
MINIO_ACCESS_KEY = "etluser"
MINIO_SECRET_KEY = "etlpass123"
BUCKET_NAME = "hospital-data"
# BUCKET_NAME = os.environ.get("BUCKET_NAME", "my-bucket")
DEPARTMENTS = ["cardiology", "neurology"]
ENRICHMENT_VERSION = "v1"  # bump this when enrichment logic changes

# ------------------- LOGGER -------------------
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ETL")


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

def safe_ts(ts: str) -> str:
    """
    Convert ISO8601 string like 2025-09-07T12:45:36+05:00
    into S3-safe filename like 20250907T124536+0500.
    """
    try:
        dt = datetime.fromisoformat(ts)
        # keep offset info, output compact form
        return dt.strftime("%Y%m%dT%H%M%S%z").replace('+', 'Z')
    except ValueError:
        # fallback: just replace unsafe chars
        return re.sub(r'[:+]', '-', ts)

# def read_staging_parquet(local_path: str) -> pd.DataFrame:
#     # assumes there's exactly one parquet file (like your current code)
#     pfiles = [f for f in os.listdir(local_path) if f.endswith(".parquet")]
#     if not pfiles:
#         raise FileNotFoundError("no parquet found in staging path: " + local_path)
#     pf = os.path.join(local_path, pfiles[0])
#     # read with pandas (pyarrow)
#     df = pd.read_parquet(pf)
#     return df

def read_staging_parquet_spark(spark: SparkSession, local_path: str) -> DataFrame:
    """
    Read staging parquet directory into a Spark DataFrame.
    """
    parq_dir = os.path.abspath(local_path)
    return spark.read.parquet(parq_dir)

# def write_parquet(df: pd.DataFrame, out_dir: str, fname: str):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, fname)
    df.to_parquet(path, index=False)
    return path

def write_parquet_spark(df: DataFrame, out_dir: str, fname: str = None, partition_by: List[str] = None):
    """
    Write Spark DataFrame to local path. If fname provided, write into directory out_dir/fname.
    """
    return write_iceberg_spark(df, partition_by)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, fname) if fname else out_dir
    # choose overwrite mode for simplicity (adjust as needed)
    writer = df.write.mode("overwrite").option("compression", "snappy")
    if partition_by:
        writer = writer.partitionBy(*partition_by)
    writer.parquet(path)
    return path

def write_iceberg_spark(df: DataFrame, run_id: str, start: str, end: str,table: str, db: str = "default", catalog: str = "local", partition_by: List[str] = None):
    """
    Drop-in replacement for write_parquet_spark that writes into an Iceberg table.

    Behavior & mapping to original args:
    - out_dir : directory you previously used for writing files. This function assumes the Iceberg
                'local' catalog's warehouse is set to a parent location that includes out_dir.
    - fname   : treated as the Iceberg table name (if None, uses basename(out_dir)).
    - partition_by : same semantics (passed as partition columns when creating table).
    - Returns a string similar to the original: the table identifier we wrote to (catalog.db.table).
    """
    
    spark = df.sparkSession
    # os.makedirs(out_dir, exist_ok=True)
    
    df2 = (df 
    .withColumn("batch_id", lit(run_id))
    .withColumn("batch_start_ts", lit(start))
    .withColumn("batch_end_ts", lit(end))
    .withColumn("ingest_ts", current_timestamp())
    .withColumn("ingest_date", date_format("ingest_ts", "yyyy-MM-dd"))
    # .withColumn("source_path", lit(f"/tmp/validated_{start}_{end}"))
    )
    
    if partition_by is None:
        partition_by = ["ingest_date"]

    # decide table name (keep semantics close to original)
    # table = fname if fname else os.path.basename(os.path.normpath(out_dir)) or "table"
    # table = "hospital_checkups"
    # catalog = "local"   # expects SPARK catalog named 'local' configured in env
    # db = "default"
    full_table = f"{catalog}.{db}.{table}"
    # logger.info("spark.sql.catalog.local:", spark.conf.get("spark.sql.catalog.local"))
    # logger.info("spark.sql.catalog.local.type:", spark.conf.get("spark.sql.catalog.local.type"))

    # helper: check if table exists
    def table_exists(name: str) -> bool:
        try:
            # spark.catalog.tableExists accepts qualified names in some versions; try both
            if spark.catalog._jcatalog.tableExists(name):
                return True
        except Exception:
            pass
        try:
            return spark.catalog.tableExists(name)
        except Exception:
            # final fallback: try to read table metadata
            try:
                spark.table(name)
                return True
            except Exception:
                return False

    exists = table_exists(full_table)

    # Write logic:
    # - If table doesn't exist -> create it (with partitioning if provided)
    # - If table exists -> overwrite to mimic original overwrite() behavior
    try:
        if not exists:
            writer = df2.writeTo(full_table)
            if partition_by:
                # create with partitioning
                writer = writer.partitionedBy(*partition_by)
            # create the table and write the data
            writer.create()
        else:
            # try an overwrite that respects partitions if present
            writer = df2.writeTo(full_table)
            if partition_by:
                # overwrite partitions (safer than full table drop)
                try:
                    writer.overwritePartitions()
                except Exception:
                    # fallback: overwrite entire table if overwritePartitions not available
                    writer.overwrite()
            else:
                # non-partitioned: overwrite entire table
                writer.overwrite()
    except Exception as e:
        # Best-effort fallback: if Iceberg write API differs for your version,
        # try createOrReplace or append as last resort to avoid data loss.
        try:
            if not exists:
                df2.writeTo(full_table).createOrReplace()
            else:
                # fallback to append to avoid accidentally losing data
                df2.writeTo(full_table).append()
        except Exception as e2:
            raise RuntimeError(f"Iceberg write failed (primary error: {e}; fallback error: {e2})")

    # return the table identifier so caller knows where data went
    return full_table


# def upload_file(s3, local_file: str, key: str):
#     s3.upload_file(local_file, BUCKET_NAME, key)
#     return f"s3://{BUCKET_NAME}/{key}"

def upload_parquet_path_with_retry(s3, local_path, bucket, s3_prefix, attempts=3):
    for attempt in range(1, attempts+1):
        try:
            upload_parquet_path(s3, local_path, bucket, s3_prefix)
            return
        except Exception as e:
            logger.warning("Upload attempt %d failed: %s", attempt, e)
            if attempt < attempts:
                time.sleep(1 * attempt)
            else:
                raise


def upload_parquet_path(s3_client, local_path: str, bucket: str, s3_prefix: str) -> None:
    """
    Upload a local file or directory to s3 under bucket/s3_prefix.
    - local_path: file path or directory path produced by Spark write (e.g. '/tmp/validated_2025-09-01_...').
    - s3_prefix: S3 key prefix where files should be placed, e.g. 'dept/tmp/validated/run-.../' or 'dept/tmp/validated/run-...'
      The function will ensure no double-slash and will place files under that prefix.
    """
    # normalize prefix (no leading slash)
    s3_prefix = s3_prefix.lstrip("/")
    if not s3_prefix.endswith("/"):
        s3_prefix = s3_prefix + "/"

    if os.path.isfile(local_path):
        filename = os.path.basename(local_path)
        dest_key = s3_prefix + filename
        s3_client.upload_file(local_path, bucket, dest_key)
        return

    # directory: walk and upload files
    if os.path.isdir(local_path):
        for root, _, files in os.walk(local_path):
            for fname in files:
                # skip hidden or temporary files if desired
                if fname.startswith("."):
                    continue
                local_file = os.path.join(root, fname)
                # compute relative path under the directory
                rel_path = os.path.relpath(local_file, local_path)
                dest_key = s3_prefix + rel_path.replace(os.path.sep, "/")
                try:
                    s3_client.upload_file(local_file, bucket, dest_key)
                except ClientError as e:
                    # optionally log and re-raise
                    logger.exception("Failed upload %s -> s3://%s/%s : %s", local_file, bucket, dest_key, e)
                    raise
        return

    raise FileNotFoundError(f"Local path does not exist: {local_path}")


# def commit_run(s3, tmp_prefix: str, final_prefix: str):
#     """
#     Copy objects from tmp_prefix to final_prefix and write _SUCCESS marker.
#     tmp_prefix and final_prefix are keys without bucket, e.g. 'fhir/validated/_tmp/run-123/'
#     """
#     # list objects under tmp_prefix
#     resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=tmp_prefix)
#     if "Contents" not in resp:
#         raise RuntimeError("no objects in tmp prefix: " + tmp_prefix)
#     for obj in resp["Contents"]:
#         src_key = obj["Key"]
#         filename = src_key.split(tmp_prefix, 1)[-1]
#         dest_key = final_prefix.rstrip("/") + "/" + filename
#         copy_source = {"Bucket": BUCKET_NAME, "Key": src_key}
#         s3.copy_object(Bucket=BUCKET_NAME, CopySource=copy_source, Key=dest_key)

#     # Write a manifest / success marker
#     success_key = final_prefix.rstrip("/") + "/_SUCCESS"
#     s3.put_object(Bucket=BUCKET_NAME, Key=success_key, Body=b"")
#     # (optionally) delete tmp objects
#     for obj in resp["Contents"]:
#         s3.delete_object(Bucket=BUCKET_NAME, Key=obj["Key"])

def commit_run(s3_client, tmp_prefix: str, final_prefix: str):
    resp = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=tmp_prefix)
    if "Contents" not in resp:
        logger.info("No files to commit from %s", tmp_prefix)
        return
    for obj in resp["Contents"]:
        src_key = obj["Key"]
        # compute filename relative to tmp_prefix
        filename = src_key.split(tmp_prefix, 1)[-1]
        dest_key = final_prefix.rstrip("/") + "/" + filename
        copy_source = {"Bucket": BUCKET_NAME, "Key": src_key}
        s3_client.copy_object(Bucket=BUCKET_NAME, CopySource=copy_source, Key=dest_key)
    # delete tmp
    for obj in resp["Contents"]:
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=obj["Key"])
    # write _SUCCESS marker
    success_key = final_prefix.rstrip("/") + "/_SUCCESS"
    s3_client.put_object(Bucket=BUCKET_NAME, Key=success_key, Body=b"")


# -------------------- FHIR -------------------
# def validate_bundles_df(df: pd.DataFrame, enrichment_version: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
#     """
#     Input: DataFrame with column `fhir_bundle_json` (string), and at least `uuid`
#     Output: two DataFrames: validated_df, errors_df
#     Both DataFrames include new columns: fhir_validation_status, enrichment_version, validated_at, fhir_bundle_json (possibly updated)
#     """
#     validated_rows = []
#     error_rows = []

#     for idx, row in df.iterrows():
#         bjson = row.get("fhir_bundle_json")
#         uid = str(row.get("uuid") or str(uuid.uuid4()))
#         now_iso = datetime.now(timezone.utc).isoformat()
#         meta = {
#             "fhir_validation_status": None,
#             "enrichment_version": enrichment_version,
#             "validated_at": now_iso,
#             "validation_error": None
#         }

#         if not bjson:
#             meta["fhir_validation_status"] = "INVALID"
#             meta["validation_error"] = "missing fhir_bundle_json"
#             row_out = row.copy()
#             for k, v in meta.items():
#                 row_out[k] = v
#             error_rows.append(row_out)
#             continue

#         try:
#             # parse JSON string -> dict
#             if isinstance(bjson, str):
#                 bundle_dict = json.loads(bjson)
#             else:
#                 bundle_dict = bjson  # assume already dict-like

#             # ensure Bundle.id exists deterministically
#             if not bundle_dict.get("id"):
#                 bundle_id = "bundle-" + deterministic_id(uid + enrichment_version)
#                 bundle_dict["id"] = bundle_id

#             # Optionally set deterministic ids for some nested resources (Patient/Encounter) if missing
#             # e.g., patient id = uuid
#             entries = bundle_dict.get("entry", [])
#             for e in entries:
#                 r = e.get("resource", {})
#                 if r.get("resourceType") == "Patient" and not r.get("id"):
#                     r["id"] = uid
#                 if r.get("resourceType") == "Encounter" and not r.get("id"):
#                     r["id"] = uid

#             # Validate via fhir.resources (Pydantic)
#             Bundle.model_validate(bundle_dict)  # raises ValidationError if invalid

#             # store updated bundle JSON back to row (canonicalized)
#             row_out = row.copy()
#             row_out["fhir_bundle_json"] = json.dumps(bundle_dict, default=str)
#             row_out["fhir_validation_status"] = "VALID"
#             row_out["enrichment_version"] = enrichment_version
#             row_out["validated_at"] = now_iso
#             validated_rows.append(row_out)
#         except (ValidationError, json.JSONDecodeError) as e:
#             logger.info("FHIR Resources Bundle raised ValidationError")
#             row_out = row.copy()
#             row_out["fhir_bundle_json"] = bjson  # keep original
#             row_out["fhir_validation_status"] = "INVALID"
#             row_out["enrichment_version"] = enrichment_version
#             row_out["validated_at"] = now_iso
#             row_out["validation_error"] = str(e)
#             logger.info(str(e))
#             error_rows.append(row_out)

#     if validated_rows:
#         validated_df = pd.DataFrame(validated_rows)
#     else:
#         validated_df = pd.DataFrame(columns=list(df.columns) + ["fhir_validation_status","enrichment_version","validated_at","validation_error"])

#     if error_rows:
#         errors_df = pd.DataFrame(error_rows)
#     else:
#         errors_df = pd.DataFrame(columns=list(df.columns) + ["fhir_validation_status","enrichment_version","validated_at","validation_error"])

#     return validated_df, errors_df

def _validate_partition_rows(
    iter_rows: Iterator[Row],
    enrichment_version: str
) -> Iterator[Dict[str, Any]]:
    """
    Partition-level validator. Processes many rows in one Python process (executor),
    validates each bundle and yields a dict per row containing original fields + validation metadata.
    """
    # Import inside function so this runs on executor
    import json
    from datetime import datetime
    from fhir.resources.bundle import Bundle
    from pydantic import ValidationError
    import hashlib, uuid

    def deterministic_id_local(seed: str) -> str:
        return hashlib.sha256(seed.encode("utf-8")).hexdigest()

    for row in iter_rows:
        # convert Row to plain dict (safe)
        row_dict: Dict[str, Any] = row.asDict(recursive=True)
        uid = str(row_dict.get("uuid") or row_dict.get("id") or str(uuid.uuid4()))
        now_iso = (datetime.now()).strftime("%Y%m%dT%H%M%S%z")
        bjson = row_dict.get("fhir_bundle_json")

        # prepare output base
        out = dict(row_dict)  # copy original columns
        out["fhir_validation_status"] = None
        out["enrichment_version"] = enrichment_version
        out["validated_at"] = now_iso
        out["validation_error"] = None

        if not bjson:
            out["fhir_validation_status"] = "INVALID"
            out["validation_error"] = "missing fhir_bundle_json"
            yield out
            continue

        try:
            bundle_dict = json.loads(bjson) if isinstance(bjson, str) else bjson

            # ensure deterministic Bundle.id
            if not bundle_dict.get("id"):
                bundle_dict["id"] = "bundle-" + deterministic_id_local(uid + enrichment_version)

            # ensure patient/encounter ids (best-effort)
            for e in bundle_dict.get("entry", []):
                r = e.get("resource", {})
                if r.get("resourceType") == "Patient" and not r.get("id"):
                    r["id"] = uid
                if r.get("resourceType") == "Encounter" and not r.get("id"):
                    r["id"] = uid

            # Validate via fhir.resources (this raises ValidationError if invalid)
            Bundle.model_validate(bundle_dict)

            # success -> canonicalize JSON string to store
            out["fhir_bundle_json"] = json.dumps(bundle_dict, default=str)
            out["fhir_validation_status"] = "VALID"
            out["validation_error"] = None
            yield out

        except (ValidationError, json.JSONDecodeError) as e:
            out["fhir_bundle_json"] = bjson  # keep original
            out["fhir_validation_status"] = "INVALID"
            out["validation_error"] = str(e)
            yield out

def _to_safe_str(v):
    # keep strings AS IS, None -> None (will become null), other -> json string
    if v is None:
        return None
    if isinstance(v, str):
        return v
    # for numbers you might want to cast to str; json preserves structure
    try:
        return json.dumps(v, default=str)
    except Exception:
        return str(v)

def validate_bundles_spark(df_spark: DataFrame, enrichment_version: str = ENRICHMENT_VERSION) -> Tuple[DataFrame, DataFrame]:
    """
    Validate bundles on executors and return two Spark DataFrames:
      (validated_df_spark, errors_df_spark)
    Both DataFrames include original columns plus:
      - fhir_validation_status (VALID/INVALID)
      - enrichment_version
      - validated_at
      - validation_error (nullable)
    """
    spark = df_spark.sparkSession
    # deps_path = "scripts/tmp/deps.zip"
    # spark.sparkContext.addPyFile(deps_path)

    # Run validation partition-wise: returns RDD of dicts
    rdd_validated = df_spark.rdd.mapPartitions(lambda it: _validate_partition_rows(it, enrichment_version))
    
    # build deterministic output column list: original df columns + metadata columns expected
    original_cols = df_spark.columns  # e.g. ["uuid","patient_name",...,"fhir_bundle_json"]
    meta_cols = ["fhir_validation_status", "enrichment_version", "validated_at", "validation_error"]
    out_cols = original_cols + meta_cols

    # Build schema: make everything StringType for robustness
    schema = StructType([StructField(c, StringType(), True) for c in out_cols])

    # Map dict -> tuple following out_cols order and JSON-serialize non-string values
    rdd_tuples = rdd_validated.map(lambda d: tuple(_to_safe_str(d.get(c)) for c in out_cols))

     # Create DataFrame using explicit schema (no inference)
    validated_full_df = spark.createDataFrame(rdd_tuples, schema=schema)
    
    # Create DataFrame from RDD of dicts; Spark will infer schema (or you can provide schema)
    # validated_full_df = spark.createDataFrame(rdd_validated)

    # Split into validated vs invalid DataFrames
    validated_df_spark = validated_full_df.filter(validated_full_df["fhir_validation_status"] == "VALID")
    errors_df_spark = validated_full_df.filter(validated_full_df["fhir_validation_status"] != "VALID")

    return validated_df_spark, errors_df_spark

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

    run_id = (datetime.now()).strftime("%Y%m%dT%H%M%S%z") + "-" + str(uuid.uuid4())[:8]
    # tmp_valid_prefix = f"fhir/validated/_tmp/run-{run_id}/"
    # final_valid_prefix = f"fhir/validated/"  # example final layout
    # tmp_error_prefix = f"fhir/errors/_tmp/run-{run_id}/"
    # final_error_prefix = f"fhir/errors/"

    # out_dir = os.path.join(output_path)  # ensure output_path is defined earlier
    # os.makedirs(out_dir, exist_ok=True)
    
    # os.environ['HADOOP_CONF_DIR'] = ''
    # os.environ['AWS_REGION'] = 'us-east-1'  # Set a default region

    # # Clear any potentially conflicting configurations
    # for key in list(os.environ.keys()):
    #     if 'S3A' in key.upper() or 'AWS' in key.upper():
    #         if '60s' in os.environ[key]:
    #             del os.environ[key]

    
    # spark = SparkSession.builder \
    # .appName("ValidatePublish") \
    # .master("local[4]") \
    # .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
    # .config("spark.sql.catalog.local", "org.apache.iceberg.spark.SparkCatalog") \
    # .config("spark.sql.catalog.local.type", "hadoop") \
    # .config("spark.sql.catalog.local.warehouse", f"s3a://{BUCKET_NAME}/") \
    # .config("spark.hadoop.fs.s3a.endpoint", MINIO_ENDPOINT) \
    # .config("spark.hadoop.fs.s3a.access.key", MINIO_ACCESS_KEY) \
    # .config("spark.hadoop.fs.s3a.secret.key", MINIO_SECRET_KEY) \
    # .config("spark.hadoop.fs.s3a.path.style.access", "true") \
    # .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false") \
    # .config("spark.hadoop.fs.s3a.retry.interval", "1000") \
    # .config("spark.hadoop.fs.s3a.retry.limit", "3") \
    # .config("spark.hadoop.fs.s3a.connection.timeout", "60000") \
    # .config("spark.hadoop.fs.s3a.socket.recv.buffer", "8192") \
    # .config("spark.hadoop.fs.s3a.socket.send.buffer", "8192") \
    # .config("spark.hadoop.fs.s3a.threads.core", "15") \
    # .config("spark.hadoop.fs.s3a.threads.max", "64") \
    # .config("spark.hadoop.fs.s3a.max.total.tasks", "5") \
    # .config("spark.hadoop.fs.s3a.multipart.size", "67108864") \
    # .config("spark.hadoop.fs.s3a.fast.upload", "true") \
    # .config("spark.jars.packages", "org.apache.iceberg:iceberg-spark-runtime-4.0_2.13:1.10.0-SNAPSHOT,org.apache.hadoop:hadoop-aws:3.4.0") \
    # .config("spark.jars.repositories", "https://repository.apache.org/content/repositories/snapshots/") \
    # .getOrCreate()
    
    # spark = (SparkSession.builder 
    # .appName("ValidatePublish") 
    # .master("local[4]") 
    # .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") 
    # .config("spark.sql.catalog.iceberg_hive", "org.apache.iceberg.spark.SparkCatalog")
    # .config("spark.sql.catalog.iceberg_hive.catalog-impl", "org.apache.iceberg.hive.HiveCatalog")
    # .config("spark.sql.catalog.iceberg_hive.uri", "thrift://localhost:9083")
    # .config("spark.sql.catalog.iceberg_hive.io-impl", "org.apache.iceberg.aws.s3.S3FileIO")
    # .config("hive.metastore.authorization.storage.checks", "false")
    # .config("spark.sql.warehouse.dir", "s3a://hospital-data/warehouse/")
    # .config("hive.exec.dynamic.partition.mode", "nonstrict")
    # .config("hive.metastore.try.direct.sql", "false")
    # # .config("spark.sql.catalog.iceberg_hive.warehouse", "s3a://hospital-data/iceberg_warehouse/")
    # .config("spark.hadoop.fs.s3a.endpoint", MINIO_ENDPOINT) 
    # .config("spark.hadoop.fs.s3a.access.key", MINIO_ACCESS_KEY) 
    # .config("spark.hadoop.fs.s3a.secret.key", MINIO_SECRET_KEY) 
    # .config("spark.hadoop.fs.s3a.path.style.access", "true") 
    # .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false") 
    # .config("spark.hadoop.fs.s3a.retry.interval", "1000") 
    # .config("spark.hadoop.fs.s3a.retry.limit", "3") 
    # .config("spark.hadoop.fs.s3a.connection.timeout", "60000") 
    # .config("spark.hadoop.fs.s3a.socket.recv.buffer", "8192") 
    # .config("spark.hadoop.fs.s3a.socket.send.buffer", "8192") 
    # .config("spark.hadoop.fs.s3a.threads.core", "15") 
    # .config("spark.hadoop.fs.s3a.threads.max", "64") 
    # .config("spark.hadoop.fs.s3a.max.total.tasks", "5") 
    # .config("spark.hadoop.fs.s3a.multipart.size", "67108864") 
    # .config("spark.hadoop.fs.s3a.fast.upload", "true") 
    # .config("spark.jars.packages", "org.apache.iceberg:iceberg-spark-runtime-4.0_2.13:1.10.0-SNAPSHOT,org.apache.hadoop:hadoop-aws:3.4.0") 
    # .config("spark.jars.repositories", "https://repository.apache.org/content/repositories/snapshots/") 
    # .getOrCreate()
    # )
    
    # spark.sql("DROP DATABASE IF EXISTS iceberg_hive.hospitalA CASCADE")   # only if you know this was the bad one
    # spark.sql("DROP TABLE IF EXISTS iceberg_hive.hospitalA.checkups_validated")
    # spark.sql("CREATE DATABASE IF NOT EXISTS iceberg_hive.hospitalA")

    # spark.sql("CREATE DATABASE IF NOT EXISTS hospitalA LOCATION 's3a://{bucket}/hospitalA/'".format(bucket=BUCKET_NAME))
    # spark.sql("""
    # CREATE DATABASE IF NOT EXISTS iceberg_hive.hospitalA
    # LOCATION 's3a://{bucket}/hospitalA/'
    # """.format(bucket=BUCKET_NAME))
    
    # spark.sql("""
    # CREATE TABLE IF NOT EXISTS iceberg_hive.hospitalA.checkups_validated (
    # id string,
    #     uuid string,
    #     doctor_id string,
    #     patient_name string,
    #     patient_age string,
    #     patient_gender string,
    #     symptoms string,
    #     diagnosis string,
    #     notes string,
    #     consultation_audio_url string,
    #     created_at string,
    #     audio_public_id string,
    #     temperature string,
    #     blood_pressure string,
    #     blood_sugar string,
    #     medications string,
    #     lab_tests string,
    #     body_weight string,
    #     med_list string,
    #     lab_list string,
    #     symptom_list string,
    #     diagnosis_list string,
    #     note_list string,
    #     bp_parsed string,
    #     fhir_bundle_json string,
    #     med_summary string,
    #     lab_summary string,
    #     fhir_validation_status string,
    #     enrichment_version string,
    #     validated_at string,
    #     validation_error string,
    #     batch_id string,
    #     batch_start_ts string,
    #     batch_end_ts string,
    #     ingest_ts timestamp,
    #     ingest_date string
    # ) USING iceberg
    # PARTITIONED BY (ingest_date)
    # LOCATION 's3a://{bucket}/hospitalA/checkups_validated/'
    # """.format(bucket=BUCKET_NAME))
    
    # spark.sql("SHOW DATABASES in iceberg_hive").show()
    # # spark.sql("SHOW TABLES IN iceberg_hive.hospitalA").show()
    
    NESSIE_URI = "localhost:19120/api/v1" 
    os.environ['AWS_REGION'] = 'us-east-1'
    os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'
    
    spark = (SparkSession.builder
    .appName("ValidatePublish")
    .master("local[4]")
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
    .config("spark.sql.catalog.nessie", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.nessie.catalog-impl", "org.apache.iceberg.nessie.NessieCatalog")
    .config("spark.sql.catalog.nessie.uri", "http://localhost:19120/api/v1")
    .config("spark.sql.catalog.nessie.ref", "main")
    .config("spark.sql.catalog.nessie.warehouse", f"s3a://{BUCKET_NAME}/iceberg/")
    .config("spark.sql.catalog.nessie.io-impl", "org.apache.iceberg.aws.s3.S3FileIO")
    # Your MinIO S3A configs
    .config("spark.hadoop.fs.s3a.endpoint", MINIO_ENDPOINT)
    .config("spark.hadoop.fs.s3a.access.key", MINIO_ACCESS_KEY)
    .config("spark.hadoop.fs.s3a.secret.key", MINIO_SECRET_KEY)
    .config("spark.hadoop.fs.s3a.path.style.access", "true")
    .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
    # .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
    # S3FileIO specific configs for MinIO
    .config("spark.hadoop.fs.s3a.aws.credentials.provider", "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider")
    .config("spark.sql.catalog.nessie.s3.endpoint", MINIO_ENDPOINT)
    .config("spark.sql.catalog.nessie.s3.access-key-id", MINIO_ACCESS_KEY)
    .config("spark.sql.catalog.nessie.s3.secret-access-key", MINIO_SECRET_KEY)
    .config("spark.sql.catalog.nessie.s3.path-style-access", "true")
    .config("spark.sql.catalog.nessie.s3.region", "us-east-1")  # Fake region for MinIO
    # Updated Iceberg packages
    .config("spark.jars.packages", "org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.9.2,org.apache.hadoop:hadoop-aws:3.4.0,org.projectnessie.nessie-integrations:nessie-spark-extensions-3.5_2.12:0.103.3")
    .config("spark.jars.repositories", "https://repository.apache.org/content/repositories/snapshots/")
    .getOrCreate()
    )
    
    spark.sql("CREATE NAMESPACE IF NOT EXISTS nessie.hospitalA")
    
    spark.sql("SHOW NAMESPACES IN nessie").show()
    
    # spark.sql("DROP TABLE IF EXISTS nessie.hospitalA.checkups_validated")

    # spark.sql("""
    # CREATE TABLE IF NOT EXISTS nessie.hospitalA.checkups (
    # id string,
    #     uuid string,
    #     doctor_id string,
    #     patient_name string,
    #     patient_age string,
    #     patient_gender string,
    #     symptoms string,
    #     diagnosis string,
    #     notes string,
    #     consultation_audio_url string,
    #     created_at string,
    #     audio_public_id string,
    #     temperature string,
    #     blood_pressure string,
    #     blood_sugar string,
    #     medications string,
    #     lab_tests string,
    #     body_weight string,
    #     med_list string,
    #     lab_list string,
    #     symptom_list string,
    #     diagnosis_list string,
    #     note_list string,
    #     bp_parsed string,
    #     fhir_bundle_json string,
    #     med_summary string,
    #     lab_summary string,
    #     fhir_validation_status string,
    #     enrichment_version string,
    #     validated_at string,
    #     validation_error string,
    #     batch_id string,
    #     batch_start_ts string,
    #     batch_end_ts string,
    #     ingest_ts timestamp,
    #     ingest_date string
    # ) USING iceberg
    # PARTITIONED BY (ingest_date)
    # """)
    
    spark.sql("SHOW TABLES IN nessie.hospitalA").show()
    
    # spark.sql("DESCRIBE nessie.hospitalA").show()

    
    



    # Before creating the Spark session, check system properties
    # logger.info("Environment variables containing 's':")
    # for key, value in os.environ.items():
    #     if 's' in value.lower() and any(char.isdigit() for char in value):
    #         logger.info(f"{key}: {value}")
    
    # for k, v in spark.sparkContext.getConf().getAll():
    #     if "s3a" in k.lower():
    #         logger.info(k, "=", v)

    # logger.info("\n ::::: SPARK JARS ::::: \n".join(jar for jar in spark.sparkContext._jsc.sc().listJars()))
    # .config("spark.sql.catalog.local.warehouse", out_dir)

    # df = read_staging_parquet_spark(spark, local_path)
    # validated_df, errors_df = validate_bundles_spark(df, ENRICHMENT_VERSION)
    
    


    # if validated_df is not None and validated_df.head(1):
    #     write_iceberg_spark(validated_df, run_id, start, end, "checkups","hospitalA", "nessie")
    # if errors_df is not None and errors_df.head(1):
    #     write_iceberg_spark(errors_df, run_id, start, end, "checkups","hospitalA", "nessie")
        
    
    spark.sql("SELECT fhir_validation_status, patient_name, ingest_ts FROM nessie.hospitalA.checkups").show()
        # write local parquet outputs
    # validated_path = None
    # errors_path = None
    # if validated_df is not None and validated_df.head(1):
    #     validated_path = write_parquet_spark(validated_df, out_dir, f"validated_{safe_ts(start)}_{safe_ts(end)}")
    # if errors_df is not None and errors_df.head(1):
    #     errors_path = write_parquet_spark(errors_df, out_dir, f"errors_{safe_ts(start)}_{safe_ts(end)}")

    spark.stop()
    
    return {
        # "run_id": run_id,
        # "validated_path": validated_path,
        # "errors_path": errors_path,
        "success": True,
        "message":"Validation task completed successfully."
    }

    # upload validated dir(s) to tmp prefix and errors dir(s) to tmp error prefix
    if validated_path:
        for dept in DEPARTMENTS:
            s3_tmp_prefix = f"{dept}/{tmp_valid_prefix}validated_{safe_ts(start)}_{safe_ts(end)}/"
            upload_parquet_path_with_retry(s3, validated_path, BUCKET_NAME, s3_tmp_prefix)
            logger.info("Uploaded validated to s3://%s/%s", BUCKET_NAME, s3_tmp_prefix)

    if errors_path:
        for dept in DEPARTMENTS:
            s3_tmp_prefix = f"{dept}/{tmp_error_prefix}errors_{safe_ts(start)}_{safe_ts(end)}/"
            upload_parquet_path_with_retry(s3, errors_path, BUCKET_NAME, s3_tmp_prefix)
            logger.info("Uploaded errors to s3://%s/%s", BUCKET_NAME, s3_tmp_prefix)

    # commit validated run (copy tmp -> final and write _SUCCESS) only if validated exists
    if validated_path:
        for dept in DEPARTMENTS:
            tmp_pref = f"{dept}/{tmp_valid_prefix}validated_{safe_ts(start)}_{safe_ts(end)}/"
            final_pref = f"{dept}/{final_valid_prefix}validated_{safe_ts(start)}_{safe_ts(end)}/"
            commit_run(s3, tmp_pref, final_pref)
            logger.info("Committed files to s3://%s/%s", BUCKET_NAME, final_valid_prefix)

    # copy errors tmp to final errors (do not add _SUCCESS). Only run if errors_path exists
    if errors_path:
        for dept in DEPARTMENTS:
            tmp_pref = f"{dept}/{tmp_error_prefix}errors_{safe_ts(start)}_{safe_ts(end)}/"
            final_pref = f"{dept}/{final_error_prefix}errors_{safe_ts(start)}_{safe_ts(end)}/"
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
            logger.info("Committed files to s3://%s/%s", BUCKET_NAME, final_error_prefix)

    return {
        # "run_id": run_id,
        # "validated_path": validated_path,
        # "errors_path": errors_path,
        "success": True,
        "message":"Validation task completed successfully."
    }



if __name__ == "__main__":
    logger.info("Enrich Validate Publish Job :: ")
    try:
        print(json.dumps(enrich_validate_and_publish(local_path, start_date_str, end_date_str)))
    except Exception as e:
        print(json.dumps({
            "success":False,
            "message": f"Error: {str(e)}\n{traceback.format_exc()}"
        }))
    