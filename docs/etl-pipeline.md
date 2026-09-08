# ETL pipeline

The pipeline turns rows from a hospital's operational PostgreSQL database into a FHIR R5
shaped Iceberg table in that hospital's own MinIO bucket, registered in the shared Nessie
catalog under the hospital's namespace.

## Who runs what

Three pieces are involved, and the split exists so that the Spark and Java dependencies
live in exactly one image.

- `node-backend` owns the configuration and the schedule. Database connection details,
  MinIO credentials, bucket, and Nessie namespace are entered by the hospital operator in
  `node-web` and stored in the node's own PostgreSQL as `ETLConfig` and `NodeConfig`. It
  does not run Spark.
- `etl-server` runs the jobs. It is a Go HTTP service with no database. Every job request
  carries all the credentials and paths it needs, so the service holds nothing between
  calls. Job state lives in memory behind a `sync.RWMutex` and the caller is responsible
  for persisting results.
- The Python scripts under `hms-datalakes/hospital_etl/scripts/` do the actual work, run as
  subprocesses by `etl-server`.

The scheduler in `node-backend/internal/services/etl.go` is a ticker guarded by a mutex and
a stop channel. Each tick submits a job for the window between `LastRunEnd` and now, then
polls `etl-server` until the job finishes, so runs are incremental and do not overlap.

## Stages

`etl-server` runs three scripts in order, passing configuration through the subprocess
environment and reading a JSON summary from each script's stdout. Spark and Ivy write
noise to stdout, so the validation stage's output is parsed from the first `{` onward.

### 1. Extraction, `extract.py`

Arguments are the start and end of the window in ISO 8601. Spark reads over the PostgreSQL
JDBC driver, filtered on `checkup_created_at`, and writes Snappy compressed Parquet to a
timestamped staging directory. It prints `{"status": "OK", "staging_path": ...}`, or omits
the staging path when the window held no rows, which `etl-server` treats as a successful
empty run rather than a failure.

Environment: `JDBC_URL`, `DB_TABLE`, `DB_USER`, `DB_PASSWORD`, `JDBC_DRIVER_PATH`,
`OUTPUT_DIR`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `BUCKET_NAME`.

The source is a denormalized `checkups` view in the hospital's operational database, with
columns including `checkup_id`, `department_name`, `patient_dob`, and JSONB `prescription`
and `test_recommendations`. The view is defined in the hospital's own system, not in this
repository; `prisma/prisma/schema.prisma` describes the underlying tables it is built from.

### 2. Transformation, `fhir_transform.py`

Arguments are the staging path and the output path. Spark UDFs build one FHIR R5 `Bundle`
per checkup, containing `Patient`, `AllergyIntolerance`, `Condition`, `Encounter` (with
`actualPeriod` and the department in `type`), `Observation` entries for vitals and
symptoms, `DocumentReference`, `ClinicalImpression`, `MedicationRequest`, and
`DiagnosticReport`. Rows with no department are given `unassigned` so that the partition
column is never null.

### 3. Validation and publication, `validate_publish.py`

Arguments are the start date, end date, normalized path, and validated output path. Each
bundle is parsed and validated with `fhir.resources` and pydantic inside
`rdd.mapPartitions`, so the library loads once per partition instead of once per row. Rows
are then split: valid ones go to the `checkups` Iceberg table and rejects to
`checkups_errors`, with the failure reason attached.

Both tables are written through a Spark session configured with the Nessie catalog, an
`s3a://{BUCKET_NAME}/iceberg/` warehouse, `S3FileIO`, and path style access. The table is
partitioned by:

```python
partition_by = ["department_name", "checkup_date"]
```

`checkup_date` is derived from the record's own `checkup_created_at`, not from the ingest
time. Partitioning on the data's real temporal property is what lets an approval be
expressed as an S3 IAM policy over exact object prefixes, which is described in
[architecture.md](architecture.md).

Environment: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `BUCKET_NAME`,
`NESSIE_NAMESPACE`, plus optional `NESSIE_URI` and `SPARK_MASTER`.

## ETL server API

All endpoints except `/health` require the `X-Internal-API-Key` header. When
`ETL_INTERNAL_API_KEY` is unset the middleware allows every request, which is meant for
local development only.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| POST | `/api/v1/jobs` | Submit a job. Returns a job ID immediately; execution is asynchronous |
| GET | `/api/v1/jobs/:id` | Poll job status, stage, per stage logs, record counts, and output paths |
| POST | `/api/v1/test-connection` | Verify the source database is reachable, by running a one row Spark JDBC read |

A job moves through the stages `extraction`, `normalization`, `validation`, then
`completed`, or stops at the stage that failed with the error recorded on the job.

Configuration comes from `ETL_SERVER_PORT` (default `9091`), `ETL_SERVER_ENV`, and
`ETL_INTERNAL_API_KEY`. Paths inside the container are fixed by the executor:
`/usr/local/bin/python`, `/app/scripts`, `/app/postgresql-42.7.7.jar`, `/app/parquet`.

## Building the image

The `etl-server` image is a Go build stage plus a `python:3.11-slim` runtime with
OpenJDK 21, and it installs `pyspark`, `boto3`, `fhir.resources`, `pydantic` and `pandas`.
It copies the Python scripts out of `hms-datalakes/hospital_etl/scripts/`, so it must be
built from the repository root. The PostgreSQL JDBC driver is downloaded from Maven Central
during the build rather than committed to the repository; the version is the
`PG_JDBC_VERSION` build argument.

```bash
docker build -f etl-server/Dockerfile -t etl-server:latest .
```

`docker-compose.etl.yml` already does this, along with starting the source PostgreSQL,
MinIO, and a MinIO client container that creates the `hospital-data` and
`hospital-metadata` buckets.
