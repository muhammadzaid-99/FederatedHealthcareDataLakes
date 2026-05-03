# Build stage - Compile Go binary
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o etl-server ./cmd/server

# Runtime stage - Python + Java + Go binary
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies (Java for Spark, curl for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openjdk-17-jre-headless \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for ETL scripts
# These are required by hospital_etl scripts (extract2.py, fhir_transform.py, validate_publish.py)
RUN pip install --no-cache-dir \
    pyspark==3.5.0 \
    boto3==1.26.139 \
    fhir.resources==6.5.0 \
    pydantic==2.5.3 \
    pandas==2.1.4

# Create directory structure for ETL operations
RUN mkdir -p /app/scripts /app/parquet/{staging,normalized,validated} /app/config

# Copy Go binary from builder stage
COPY --from=builder /build/etl-server /app/

# NOTE: Python ETL scripts should be copied from build context root.
# Build this Dockerfile from repository root with:
#   docker build -f etl-server/Dockerfile -t etl-server:latest .
# 
# This allows the COPY commands below to find scripts from the root context:
COPY hms-datalakes/hospital_etl/scripts/ /app/scripts/

# Copy JDBC driver for PostgreSQL connectivity
COPY hms-datalakes/hospital_etl/postgresql-42.7.7.jar /app/

# Copy sample config (can be overridden via volume mount or env vars)
COPY hms-datalakes/hospital_etl/config.json /app/config/

# Set environment variables for Python and Spark
# These ensure Spark workers use the same Python environment as the driver
ENV PYTHONUNBUFFERED=1 \
    PYSPARK_PYTHON=/usr/local/bin/python \
    PYSPARK_DRIVER_PYTHON=/usr/local/bin/python \
    SPARK_NO_DAEMONIZE=1 \
    JDBC_DRIVER_PATH=/app/postgresql-42.7.7.jar \
    SCRIPTS_PATH=/app/scripts \
    OUTPUT_DIR=/app/parquet

# Expose ETL API port
EXPOSE 9091

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9091/health || exit 1

# Run the ETL server
CMD ["./etl-server"]
