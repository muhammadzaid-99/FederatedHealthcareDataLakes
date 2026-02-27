"""
validate_publish_2.py

Validates FHIR bundles and publishes data to Iceberg tables via Nessie catalog.
Adapted for the NEW schema with:
- checkup_id instead of uuid
- prescription (JSONB) and test_recommendations (JSONB)
- heart_rate, insights, gap_analysis, department_name
- No patient demographics (name, age, gender)
- No doctor_id, consultation_audio_url, body_weight
"""

import os
import sys
import time
import logging
import json
import uuid
import re
import io
from contextlib import redirect_stdout, redirect_stderr
from pyspark.sql import SparkSession, DataFrame, Row
from pyspark.sql.types import StructType, StructField, StringType
from pyspark.sql.functions import lit, current_timestamp, date_format, to_date, col, when, coalesce
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
from fhir.resources.bundle import Bundle
from pydantic import ValidationError
import hashlib
from typing import Iterator, Dict, Any, Tuple, List
import traceback

# CLI args
start_date_str = sys.argv[1]
end_date_str = sys.argv[2]
local_path = sys.argv[3]
output_path = sys.argv[4]

# Required environment variables
REQUIRED_ENV_VARS = {
    "MINIO_ENDPOINT": os.environ.get("MINIO_ENDPOINT"),
    "MINIO_ACCESS_KEY": os.environ.get("MINIO_ACCESS_KEY"),
    "MINIO_SECRET_KEY": os.environ.get("MINIO_SECRET_KEY"),
    "BUCKET_NAME": os.environ.get("BUCKET_NAME"),
    "NESSIE_NAMESPACE": os.environ.get("NESSIE_NAMESPACE"),
}

missing_vars = [name for name, value in REQUIRED_ENV_VARS.items() if not value]
if missing_vars:
    error_msg = f"Missing or empty required environment variables: {', '.join(missing_vars)}"
    print(json.dumps({"success": False, "message": error_msg}), flush=True)
    sys.exit(1)

MINIO_ENDPOINT = REQUIRED_ENV_VARS["MINIO_ENDPOINT"]
MINIO_ACCESS_KEY = REQUIRED_ENV_VARS["MINIO_ACCESS_KEY"]
MINIO_SECRET_KEY = REQUIRED_ENV_VARS["MINIO_SECRET_KEY"]
BUCKET_NAME = REQUIRED_ENV_VARS["BUCKET_NAME"]
NESSIE_NAMESPACE = REQUIRED_ENV_VARS["NESSIE_NAMESPACE"]
ENRICHMENT_VERSION = "v2"

# Logger
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ETL")
logger.info(f"Config - NESSIE_NAMESPACE: '{NESSIE_NAMESPACE}', BUCKET_NAME: '{BUCKET_NAME}', MINIO_ENDPOINT: '{MINIO_ENDPOINT}'")


def deterministic_id(seed: str) -> str:
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=BUCKET_NAME)
    except ClientError:
        s3.create_bucket(Bucket=BUCKET_NAME)


def read_staging_parquet_spark(spark: SparkSession, local_path: str) -> DataFrame:
    parq_dir = os.path.abspath(local_path)
    return spark.read.parquet(parq_dir)


def write_iceberg_spark(
    df: DataFrame, 
    run_id: str, 
    start: str, 
    end: str,
    table: str, 
    db: str = "default", 
    catalog: str = "nessie", 
    partition_by: List[str] = None
) -> str:
    """Write DataFrame to Iceberg table via Nessie catalog."""
    spark = df.sparkSession
    
    # Ensure department_name is never null/empty for partitioning
    if "department_name" in df.columns:
        df = df.withColumn(
            "department_name",
            when((col("department_name").isNull()) | (col("department_name") == ""), lit("unassigned"))
            .otherwise(col("department_name"))
        )
    else:
        df = df.withColumn("department_name", lit("unassigned"))
        
    # df.select("checkup_created_at").show(10, False)
    # df.printSchema()
    
    # Extract date from checkup_created_at for partitioning (use actual data date, not ingest date)
    # Use date_format to cast timestamp to date string, then convert to date type
    if "checkup_created_at" not in df.columns:
        raise Exception("checkup_created_at column missing")
    
    df = df.withColumn(
        "checkup_date",
        coalesce(
            to_date(col("checkup_created_at"), "yyyy-MM-dd HH:mm:ss.SSSSSS"),
            to_date(col("checkup_created_at"), "yyyy-MM-dd HH:mm:ss.SSS"),
            to_date(col("checkup_created_at"), "yyyy-MM-dd HH:mm:ss"),
            to_date(col("checkup_created_at"), "yyyy-MM-dd"),
        )
    )
    
    df2 = (df 
        .withColumn("batch_id", lit(run_id))
        .withColumn("batch_start_ts", lit(start))
        .withColumn("batch_end_ts", lit(end))
        .withColumn("ingest_ts", current_timestamp())
        .withColumn("ingest_date", date_format("ingest_ts", "yyyy-MM-dd"))
    )
    
    if partition_by is None:
        # Partition by department first, then by checkup date (when record was created, not when ingested)
        # This aligns partitioning with actual data temporal properties for better IAM date-based access control
        partition_by = ["department_name", "checkup_date"]

    full_table = f"{catalog}.`{db}`.{table}"

    def table_exists(name: str) -> bool:
        try:
            if spark.catalog._jcatalog.tableExists(name):
                return True
        except Exception:
            pass
        try:
            return spark.catalog.tableExists(name)
        except Exception:
            try:
                spark.table(name)
                return True
            except Exception:
                return False

    exists = table_exists(full_table)

    try:
        if not exists:
            # Create new table with partitioning
            writer = df2.writeTo(full_table)
            if partition_by:
                writer = writer.partitionedBy(*partition_by)
            writer.create()
        else:
            # Table exists - use createOrReplace to handle schema changes
            # This will replace the table with new schema if columns don't match
            writer = df2.writeTo(full_table)
            if partition_by:
                writer = writer.partitionedBy(*partition_by)
            writer.createOrReplace()
    except Exception as e:
        # Final fallback: try append mode (may fail if schema incompatible)
        try:
            logger.warning(f"CreateOrReplace failed, attempting append: {e}")
            df2.writeTo(full_table).append()
        except Exception as e2:
            raise RuntimeError(f"Iceberg write failed (primary error: {e}; fallback error: {e2})")

    return full_table


def _validate_partition_rows(
    iter_rows: Iterator[Row],
    enrichment_version: str
) -> Iterator[Dict[str, Any]]:
    """Partition-level FHIR bundle validator."""
    import json
    from datetime import datetime
    from fhir.resources.bundle import Bundle
    from pydantic import ValidationError
    import hashlib
    import uuid as uuid_mod

    def deterministic_id_local(seed: str) -> str:
        return hashlib.sha256(seed.encode("utf-8")).hexdigest()

    for row in iter_rows:
        row_dict: Dict[str, Any] = row.asDict(recursive=True)
        # Use checkup_id as unique identifier (new schema)
        uid = str(row_dict.get("checkup_id") or row_dict.get("id") or str(uuid_mod.uuid4()))
        now_iso = datetime.now().strftime("%Y%m%dT%H%M%S%z")
        bjson = row_dict.get("fhir_bundle_json")

        out = dict(row_dict)
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

            if not bundle_dict.get("id"):
                bundle_dict["id"] = "bundle-" + deterministic_id_local(uid + enrichment_version)

            for e in bundle_dict.get("entry", []):
                r = e.get("resource", {})
                if r.get("resourceType") == "Patient" and not r.get("id"):
                    r["id"] = f"patient-{uid}"
                if r.get("resourceType") == "Encounter" and not r.get("id"):
                    r["id"] = uid

            Bundle.model_validate(bundle_dict)

            out["fhir_bundle_json"] = json.dumps(bundle_dict, default=str)
            out["fhir_validation_status"] = "VALID"
            out["validation_error"] = None
            yield out

        except (ValidationError, json.JSONDecodeError) as e:
            out["fhir_bundle_json"] = bjson
            out["fhir_validation_status"] = "INVALID"
            out["validation_error"] = str(e)
            yield out


def _to_safe_str(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v
    # datetime/date must become plain strings, NOT json.dumps (which adds extra quotes)
    import datetime as _dt
    if isinstance(v, (_dt.datetime, _dt.date)):
        return str(v)
    try:
        return json.dumps(v, default=str)
    except Exception:
        return str(v)


def validate_bundles_spark(df_spark: DataFrame, enrichment_version: str = ENRICHMENT_VERSION) -> Tuple[DataFrame, DataFrame]:
    """Validate FHIR bundles and return validated and error DataFrames."""
    spark = df_spark.sparkSession

    rdd_validated = df_spark.rdd.mapPartitions(lambda it: _validate_partition_rows(it, enrichment_version))
    
    original_cols = df_spark.columns
    meta_cols = ["fhir_validation_status", "enrichment_version", "validated_at", "validation_error"]
    out_cols = original_cols + meta_cols

    schema = StructType([StructField(c, StringType(), True) for c in out_cols])
    rdd_tuples = rdd_validated.map(lambda d: tuple(_to_safe_str(d.get(c)) for c in out_cols))
    validated_full_df = spark.createDataFrame(rdd_tuples, schema=schema)

    validated_df_spark = validated_full_df.filter(validated_full_df["fhir_validation_status"] == "VALID")
    errors_df_spark = validated_full_df.filter(validated_full_df["fhir_validation_status"] != "VALID")

    return validated_df_spark, errors_df_spark


def enrich_validate_and_publish(local_path: str, start: str, end: str):
    """Main entry: read, validate, and publish to Iceberg via Nessie."""
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )
    ensure_bucket(s3)

    run_id = datetime.now().strftime("%Y%m%dT%H%M%S%z") + "-" + str(uuid.uuid4())[:8]
    
    os.environ['AWS_REGION'] = 'us-east-1'
    os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'
    
    stdout_buffer = io.StringIO()
    
    with redirect_stdout(stdout_buffer):
        spark = (SparkSession.builder
            .appName("ValidatePublish_v2")
            .master("local[4]")
            .config("spark.ui.showConsoleProgress", "false")
            .config("spark.ui.enabled", "false")
            .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
            .config("spark.sql.catalog.nessie", "org.apache.iceberg.spark.SparkCatalog")
            .config("spark.sql.catalog.nessie.catalog-impl", "org.apache.iceberg.nessie.NessieCatalog")
            .config("spark.sql.catalog.nessie.uri", "http://localhost:19120/api/v1")
            .config("spark.sql.catalog.nessie.ref", "main")
            .config("spark.sql.catalog.nessie.warehouse", f"s3a://{BUCKET_NAME}/iceberg/")
            .config("spark.sql.catalog.nessie.io-impl", "org.apache.iceberg.aws.s3.S3FileIO")
            .config("spark.hadoop.fs.s3a.endpoint", MINIO_ENDPOINT)
            .config("spark.hadoop.fs.s3a.access.key", MINIO_ACCESS_KEY)
            .config("spark.hadoop.fs.s3a.secret.key", MINIO_SECRET_KEY)
            .config("spark.hadoop.fs.s3a.path.style.access", "true")
            .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
            .config("spark.hadoop.fs.s3a.aws.credentials.provider", "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider")
            .config("spark.sql.catalog.nessie.s3.endpoint", MINIO_ENDPOINT)
            .config("spark.sql.catalog.nessie.s3.access-key-id", MINIO_ACCESS_KEY)
            .config("spark.sql.catalog.nessie.s3.secret-access-key", MINIO_SECRET_KEY)
            .config("spark.sql.catalog.nessie.s3.path-style-access", "true")
            .config("spark.sql.catalog.nessie.s3.region", "us-east-1")
            .config("spark.sql.legacy.timeParserPolicy", "LEGACY")
            .config("spark.jars.packages", "org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.9.2,org.apache.hadoop:hadoop-aws:3.4.0,org.projectnessie.nessie-integrations:nessie-spark-extensions-3.5_2.12:0.103.3")
            .config("spark.jars.repositories", "https://repository.apache.org/content/repositories/snapshots/")
            .getOrCreate()
        )
        
        spark.sparkContext.setLogLevel("ERROR")
        spark.sql(f"CREATE NAMESPACE IF NOT EXISTS nessie.`{NESSIE_NAMESPACE}`")
        
        df = read_staging_parquet_spark(spark, local_path)
        validated_df, errors_df = validate_bundles_spark(df, ENRICHMENT_VERSION)
        
        if validated_df is not None and not validated_df.rdd.isEmpty():
            write_iceberg_spark(validated_df, run_id, start, end, "checkups", NESSIE_NAMESPACE, "nessie")
        if errors_df is not None and not errors_df.rdd.isEmpty():
            write_iceberg_spark(errors_df, run_id, start, end, "checkups_errors", NESSIE_NAMESPACE, "nessie")
        
        # Get counts from current batch DataFrames (not from historical table data)
        valid_count = validated_df.count() if validated_df is not None else 0
        error_count = errors_df.count() if errors_df is not None else 0
        
        spark.stop()
    
    logger.info("Nessie namespace created/verified")
    logger.info("Nessie tables verified")
    
    records_validated = valid_count
    records_failed = error_count
    
    logger.info(f"Validation complete: {records_validated} valid, {records_failed} failed")
    
    return {
        "success": True,
        "message": "Validation task completed successfully.",
        "records_validated": records_validated,
        "records_failed": records_failed
    }


if __name__ == "__main__":
    logger.info("Enrich Validate Publish Job (v2)")
    
    captured_stdout = io.StringIO()
    result = None
    
    try:
        with redirect_stdout(captured_stdout):
            result = enrich_validate_and_publish(local_path, start_date_str, end_date_str)
        
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": f"Error: {str(e)}\n{traceback.format_exc()}"
        }))
