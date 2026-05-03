# ETL Server Deployment Guide

## Current Architecture Analysis

Your project has **two separate ETL systems** that need different deployment strategies:

### 1. **ETL-Server** (`/etl-server`)
- **Type:** Standalone HTTP API service (Go-based)
- **Purpose:** Receives HTTP requests to trigger ETL jobs (called by node-backend)
- **Runtime:** Executes Python ETL scripts from HTTP API
- **Location:** Listens on port 9091
- **Dependencies:**
  - Go 1.25
  - Python 3.11 with PySpark
  - Java 17 (for PySpark)
  - PostgreSQL JDBC driver
  - Python packages: `pyspark`, `boto3`, `fhir.resources`, `pydantic`, `pandas`

**Key Issue:** The current Dockerfile builds a Go binary but doesn't include the Python ETL scripts that need to be executed.

### 2. **Hospital ETL Scheduler** (`/hms-datalakes/hospital_etl/main.go`)
- **Type:** Standalone scheduler (periodic job runner)
- **Purpose:** Automatically runs ETL pipeline on fixed schedule
- **Runtime:** Executes Python scripts periodically via subprocess
- **Dependencies:** Same as ETL-Server
- **Currently uses:** Hard-coded Python venv at `/home/muhammad-zaid/myenv/bin/python`

**Key Issue:** Hard-coded paths won't work in Docker - needs to use container's Python.

### 3. **Node-Backend Integration** (`/node-backend`)
- **Type:** Application backend with ETL service integration
- **Purpose:** Manages ETL configuration and job history
- **Models:** `ETLConfig`, `ETLJob`
- **Service:** Full ETL orchestration (extract, normalize, validate, publish)
- **API Endpoints:** Config management, scheduler control, job monitoring

---

## Deployment Strategy

### Phase 1: Docker Image for ETL-Server

The ETL-Server Docker image needs:

1. **Go build stage** - Compile the Go service
2. **Python runtime stage** - Install Python ecosystem, Spark, Java, dependencies
3. **Copy Python scripts** - Include ETL scripts from both:
   - `hms-datalakes/hospital_etl/scripts/*.py`
   - `node-backend/scripts/*.py` (duplicates, but safer to include both)
4. **Copy JDBC driver** - For PostgreSQL connectivity
5. **Environment setup** - PYSPARK configuration

### Phase 2: Docker Compose Orchestration

For complete local deployment, you need:

```
Networks:
├── ETL-Server (Go, port 9091)
├── Node-Backend (Go, port 8000)
├── PostgreSQL (port 5435 for hospital data)
├── MinIO (port 9000 for data lake storage)
├── Spark Master (optional, for distributed spark)
└── Shared volumes for parquet data
```

### Phase 3: Configuration Management

- **Volume Mounts:**
  - `/app/parquet/` - Staging, normalized, validated data
  - `/app/config/` - Configuration files
  - `/app/scripts/` - Python scripts
  
- **Environment Variables:**
  - Database connection details
  - MinIO credentials
  - Spark configuration (memory, cores)
  - PYSPARK_PYTHON path inside container
  - JDBC_DRIVER_PATH

---

## Key Dependencies

### Python Packages

```
pyspark==3.5.0          # PySpark for distributed processing
boto3==1.26.0           # AWS S3 / MinIO SDK
fhir.resources==6.5.0   # FHIR data model validation
pydantic==2.0.0         # Data validation
pandas==2.0.0           # Data manipulation
```

### System Dependencies

```
- Java 17 (OpenJDK for Spark JVM)
- Python 3.11
- PostgreSQL client (optional, for debugging)
- curl/wget (for health checks)
```

### Data Storage

```
- PostgreSQL: Source database (checkups table)
- MinIO: Data lake storage (hospital-data bucket)
- Local volumes: Staging/normalized/validated parquet files
```

---

## Challenges & Solutions

| Challenge | Root Cause | Solution |
|-----------|-----------|----------|
| Hard-coded Python venv paths | Scripts use `/home/muhammad-zaid/myenv/bin/python` | Use container's Python at `/usr/local/bin/python` |
| Scripts assume local file paths | `config.json` at root, `parquet/` dir | Mount volumes or use environment variables |
| JDBC driver location | Script looks for `postgresql-42.7.7.jar` in current dir | Copy to container and set `JDBC_DRIVER_PATH` env var |
| MinIO connection | Hard-coded `localhost:9000` | Use Docker service names (`minio:9000`) |
| PostgreSQL connection | Hard-coded `localhost:5435` | Use Docker service names (`postgres:5432`) |
| Spark memory issues | PySpark defaults may exhaust container memory | Configure `spark.driver.memory` and `spark.executor.memory` |
| Python dependencies in Spark executors | Workers may not have packages installed | Set `PYSPARK_PYTHON` to container's Python executable |

---

## Recommended Improvements

### Short-term (For Current Deployment)

1. **Update Dockerfiles:**
   - ETL-Server: Copy Python scripts and JDBC driver
   - Hospital-ETL: Create Dockerfile using same base image
   - Node-Backend: Include Python environment

2. **Create docker-compose.yml:**
   - Database services
   - MinIO service
   - ETL-Server service
   - Optional Spark cluster

3. **Environment Variables:**
   - Replace hard-coded paths with env vars
   - Use Docker service names instead of localhost

### Medium-term (Architectural Improvements)

1. **Separate Python into dedicated image:**
   - Create Python-only image with Spark pre-installed
   - Reduces Go image size
   - Easier to debug Python issues

2. **Configuration strategy:**
   - Move from file-based to environment variable-based
   - Support ConfigMap/Secrets in Kubernetes
   - Runtime configuration without rebuilds

3. **Job queue system:**
   - Replace subprocess calls with proper job queue (Celery/RQ)
   - Better error handling and retries
   - Distributed execution support

### Long-term (Cloud VPS Deployment)

1. **Kubernetes manifests:**
   - StatefulSet for PostgreSQL
   - Deployment for ETL-Server
   - ConfigMaps for configuration
   - PersistentVolumes for data

2. **Monitoring & Logging:**
   - Structured logging (JSON format)
   - Prometheus metrics
   - Centralized logging (ELK/Loki)

3. **CI/CD Integration:**
   - Automated builds and pushes to registry
   - Helm charts for deployment
   - GitOps workflow

---

## Testing Strategy

1. **Local Testing:**
   - `docker-compose up` to start all services
   - Test ETL-Server health: `curl http://localhost:9091/health`
   - Trigger job: `curl -X POST http://localhost:9091/api/v1/jobs -H "X-API-Key: secret"`

2. **Integration Testing:**
   - Verify database connections
   - Test MinIO upload
   - Validate FHIR output
   - Check data integrity end-to-end

3. **Performance Testing:**
   - Load test with multiple job submissions
   - Monitor memory usage during Spark jobs
   - Query performance on large datasets

---

## Next Steps

1. ✅ **Updated ETL-Server Dockerfile** - Include all Python scripts and dependencies
2. ✅ **Docker Compose file** - Complete local deployment stack
3. ✅ **Environment template** - `.env` file with all required variables
4. 📝 **Deployment script** - Shell script to deploy to VPS
5. 📝 **Monitoring setup** - Health checks and logging

