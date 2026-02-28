# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o etl-server ./cmd/server

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for ETL scripts
RUN pip install --no-cache-dir pyspark boto3 fhir.resources pydantic pandas

# Copy binary from builder
COPY --from=builder /app/etl-server .

# Expose port
EXPOSE 9091

# Run the application
CMD ["./etl-server"]
