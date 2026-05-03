# ETL Server & Scripts Technical Reference

## ETL Server Architecture

The ETL Server is a **Go HTTP API** that executes Python ETL scripts on-demand. It receives requests from node-backend and orchestrates the complete data pipeline.

### Server Location
- **Binary:** `etl-server/cmd/server/main.go`
- **API Port:** 9091
- **Health endpoint:** `GET /health`

### API Endpoints

```
POST /api/v1/jobs              - Trigger ETL job (requires API key)
GET /api/v1/jobs/:id           - Poll job status
GET /health                    - Health check
```

---

## Python ETL Scripts

All scripts are in `hms-datalakes/hospital_etl/scripts/`. The server executes these via subprocess with environment variables for configuration.

### 1. **extract2.py** - Data Extraction
**Purpose:** Extract data from PostgreSQL and write to parquet

**Inputs:**
- `sys.argv[1]` - Start date (ISO8601 format)
- `sys.argv[2]` - End date (ISO8601 format)

**Environment Variables Required:**
```
JDBC_URL              jdbc:postgresql://localhost:5435/hms
DB_TABLE              checkups
DB_USER               postgres
DB_PASSWORD           12345678
JDBC_DRIVER_PATH      /path/to/postgresql-42.7.7.jar
OUTPUT_DIR            /app/parquet
MINIO_ENDPOINT        http://localhost:9000
MINIO_ACCESS_KEY      etluser
MINIO_SECRET_KEY      etlpass123
BUCKET_NAME           hospital-data
```

**Output:**
```json
{
  "success": true,
  "staging_path": "/app/parquet/staging/checkups_2025-09-11_15-58-44",
  "records_extracted": 1523
}
```

**What it does:**
1. Creates Spark session with PostgreSQL JDBC driver
2. Queries `checkups` table for records between start/end dates
3. Handles enrichment per department (cardiology, neurology)
4. Writes parquet files to staging directory
5. Uploads to MinIO bucket

---

### 2. **fhir_transform.py** - Data Normalization
**Purpose:** Transform parquet data to FHIR format

**Inputs:**
- `sys.argv[1]` - Staging path (from extract2.py output)
- `sys.argv[2]` - Normalized output path

**Key Features:**
- Parses free-text fields (medications, labs, symptoms, diagnosis)
- Splits by newline/semicolon/comma
- Converts vitals to FHIR Observation format
- Creates FHIR Bundle JSON structure
- Preserves original raw fields for audit

**Output:**
```json
{
  "success": true,
  "message": "Normalized N records",
  "normalized_path": "/app/parquet/normalized/checkups_2025-09-11_15-58-44"
}
```

**FHIR Fields Created:**
- `fhir_bundle_json` - Full FHIR Bundle (JSON string)
- `med_list` - Array of medications (parsed)
- `lab_list` - Array of lab tests (parsed)
- `symptom_list` - Array of symptoms (parsed)
- `diagnosis_list` - Array of diagnoses (parsed)
- `note_list` - Array of notes (parsed)

---

### 3. **validate_publish.py** - Validation & Upload
**Purpose:** Validate FHIR data and publish to MinIO

**Inputs:**
- `sys.argv[1]` - Start date
- `sys.argv[2]` - End date
- `sys.argv[3]` - Normalized path (from fhir_transform.py)
- `sys.argv[4]` - Validated output path

**Environment Variables:**
- Same as extract2.py (needs JDBC, MinIO, etc.)

**Output:**
```json
{
  "success": true,
  "message": "Published N records to validated/",
  "validated_path": "/app/parquet/validated/checkups_2025-09-11_15-58-44",
  "records_published": 1523
}
```

**What it does:**
1. Reads normalized parquet files
2. Validates FHIR bundle JSON
3. Adds metadata (validation_timestamp, data_version)
4. Writes validated parquet to local disk
5. Uploads to MinIO: `s3://hospital-data/validated/TIMESTAMP/`
6. Creates catalog metadata for Iceberg integration

---

## Docker Execution Flow

```
HTTP Request (node-backend)
    ↓
etl-server (Go) receives request
    ↓
    ├→ subprocess: python /app/scripts/extract2.py START END
    │  └→ Output: staging_path
    │
    ├→ subprocess: python /app/scripts/fhir_transform.py STAGING NORMALIZED
    │  └→ Output: normalized_path
    │
    └→ subprocess: python /app/scripts/validate_publish.py START END NORMALIZED VALIDATED
       └→ Output: validated_path + MinIO upload
    ↓
Response back to node-backend with job status
```

---

## Key Environment Variables (Docker)

**Inside Container:**
```
PYSPARK_PYTHON=/usr/local/bin/python
PYSPARK_DRIVER_PYTHON=/usr/local/bin/python
JDBC_DRIVER_PATH=/app/postgresql-42.7.7.jar
SCRIPTS_PATH=/app/scripts
OUTPUT_DIR=/app/parquet
SPARK_DRIVER_MEMORY=2g
SPARK_EXECUTOR_MEMORY=2g
```

**Database Access:**
```
DB_HOST=postgres              # Docker service name
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=12345678
```

**MinIO Access:**
```
MINIO_ENDPOINT=http://minio:9000    # Docker service name
MINIO_ACCESS_KEY=etluser
MINIO_SECRET_KEY=etlpass123
```

---

## Data Flow & Storage

```
PostgreSQL (checkups table)
    ↓
    extract2.py
    ↓
/app/parquet/staging/           (Raw parquet)
    ↓
    fhir_transform.py
    ↓
/app/parquet/normalized/        (FHIR format)
    ↓
    validate_publish.py
    ↓
/app/parquet/validated/         (Validated + metadata)
    ↓ (Upload)
    ↓
MinIO: s3://hospital-data/validated/TIMESTAMP/
```

---

## Docker Build

**Build from repo root:**
```bash
docker build -f etl-server/Dockerfile -t etl-server:latest .
```

**Key requirements:**
1. Copies `hms-datalakes/hospital_etl/scripts/` → `/app/scripts/`
2. Copies `postgresql-42.7.7.jar` → `/app/`
3. Installs: pyspark, boto3, fhir.resources, pydantic, pandas
4. Java 17 for Spark
5. Sets PYSPARK_PYTHON env vars for executor compatibility

---

## Running Locally

```bash
# Set up environment
export ETL_API_KEY="dev-secret"
export DB_PASSWORD="12345678"
export MINIO_ACCESS_KEY="etluser"
export MINIO_SECRET_KEY="etlpass123"

# Start services
docker-compose -f docker-compose.etl.yml up -d

# Test health
curl http://localhost:9091/health

# Trigger job
curl -X POST http://localhost:9091/api/v1/jobs \
  -H "X-API-Key: dev-secret" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2024-01-01T00:00:00Z","endDate":"2024-01-31T23:59:59Z"}'
```

---

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| `PYSPARK_PYTHON not found` | Container must have `/usr/local/bin/python`, set env var inside container |
| JDBC driver not found | Must copy `postgresql-42.7.7.jar` into container, set `JDBC_DRIVER_PATH=/app/postgresql-42.7.7.jar` |
| PostgreSQL connection refused | Use Docker service name `postgres` not `localhost`, DNS resolution within network |
| MinIO connection failed | Use Docker service name `minio` not `localhost:9000` |
| Out of memory | Reduce `SPARK_DRIVER_MEMORY` and `SPARK_EXECUTOR_MEMORY` in env vars |
| Scripts not found | Must be copied to `/app/scripts/` in Dockerfile from `hms-datalakes/hospital_etl/scripts/` |
