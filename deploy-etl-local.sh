#!/bin/bash

# ETL Deployment Script - LOCAL DEVELOPMENT
# This script builds and deploys the ETL infrastructure locally using Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

log_info "ETL Deployment Script Starting..."
log_info "Project root: $PROJECT_ROOT"

# ============================================================================
# VALIDATION
# ============================================================================

log_info "Validating environment..."

# Check Docker installation
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

log_success "Docker and Docker Compose are installed"

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================

log_info "Setting up environment..."

# Create .env.etl if it doesn't exist
if [ ! -f "$PROJECT_ROOT/.env.etl" ]; then
    if [ -f "$PROJECT_ROOT/.env.etl.example" ]; then
        cp "$PROJECT_ROOT/.env.etl.example" "$PROJECT_ROOT/.env.etl"
        log_success "Created .env.etl from template"
    else
        log_warn ".env.etl.example not found, using defaults"
    fi
else
    log_info ".env.etl already exists"
fi

# ============================================================================
# BUILD PHASE
# ============================================================================

log_info "Building ETL Server Docker image..."

# Build from repository root to include all context (etl-server, hms-datalakes, etc.)
docker-compose -f "$PROJECT_ROOT/docker-compose.etl.yml" build --no-cache etl-server

if [ $? -eq 0 ]; then
    log_success "ETL Server image built successfully"
else
    log_error "Failed to build ETL Server image"
    exit 1
fi

# ============================================================================
# DEPLOYMENT PHASE
# ============================================================================

log_info "Starting ETL infrastructure..."

# Stop existing containers (if any)
docker-compose -f "$PROJECT_ROOT/docker-compose.etl.yml" down 2>/dev/null || true

# Start all services
docker-compose -f "$PROJECT_ROOT/docker-compose.etl.yml" up -d

if [ $? -ne 0 ]; then
    log_error "Failed to start services"
    exit 1
fi

log_success "All services started in detached mode"

# ============================================================================
# HEALTH CHECKS
# ============================================================================

log_info "Waiting for services to be ready..."

# Function to wait for service
wait_for_service() {
    local service=$1
    local timeout=30
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f "$PROJECT_ROOT/docker-compose.etl.yml" exec -T "$service" true 2>/dev/null; then
            log_success "$service is ready"
            return 0
        fi
        
        elapsed=$((elapsed + 1))
        echo -n "."
        sleep 1
    done

    log_error "Timeout waiting for $service"
    return 1
}

# Wait for PostgreSQL
log_info "Checking PostgreSQL..."
if docker-compose -f "$PROJECT_ROOT/docker-compose.etl.yml" exec -T postgres-hospital pg_isready -U postgres 2>/dev/null; then
    log_success "PostgreSQL is ready"
else
    log_warn "PostgreSQL health check may have failed, continuing..."
fi

# Wait for MinIO
log_info "Checking MinIO..."
if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    log_success "MinIO is ready"
else
    log_warn "MinIO health check failed, giving more time..."
    sleep 5
fi

# Wait for ETL Server
log_info "Checking ETL Server..."
for i in {1..30}; do
    if curl -s http://localhost:9091/health > /dev/null 2>&1; then
        log_success "ETL Server is ready"
        break
    fi
    echo -n "."
    sleep 1
done

# ============================================================================
# SUMMARY
# ============================================================================

log_info "Deployment Summary:"
echo ""
echo -e "${BLUE}Services running:${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.etl.yml" ps

echo ""
echo -e "${BLUE}Access Points:${NC}"
echo "  PostgreSQL (hospital data): localhost:5435"
echo "  MinIO API: localhost:9000"
echo "  MinIO Console: localhost:9001"
echo "  ETL Server API: localhost:9091"

echo ""
echo -e "${BLUE}Testing:${NC}"
echo "  Health check: curl http://localhost:9091/health"
echo "  Job trigger: curl -X POST http://localhost:9091/api/v1/jobs \\"
echo "    -H 'X-API-Key: dev-etl-api-key' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"startDate\": \"2024-01-01T00:00:00Z\", \"endDate\": \"2024-01-31T23:59:59Z\"}'"

echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  View logs: docker-compose -f docker-compose.etl.yml logs -f etl-server"
echo "  Stop services: docker-compose -f docker-compose.etl.yml down"
echo "  Cleanup (remove volumes): docker-compose -f docker-compose.etl.yml down -v"

echo ""
log_success "ETL Server deployment completed successfully!"
