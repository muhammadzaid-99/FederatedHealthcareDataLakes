#!/bin/bash

# ETL Deployment Script - CLOUD VPS
# This script deploys the ETL infrastructure to a cloud VPS with proper production settings

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

# ============================================================================
# CONFIGURATION
# ============================================================================

# VPS Configuration (customize these)
VPS_HOST=${VPS_HOST:-"your-vps.example.com"}
VPS_USER=${VPS_USER:-"ubuntu"}
VPS_SSH_KEY=${VPS_SSH_KEY:-"$HOME/.ssh/id_rsa"}
DEPLOY_PATH=${DEPLOY_PATH:-"/opt/hms-dls2"}

# Docker Registry (optional, push images to registry)
REGISTRY=${REGISTRY:-""}
IMAGE_NAME=${IMAGE_NAME:-"etl-server"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}

log_info "ETL Cloud VPS Deployment Script Starting..."
log_info "VPS Host: $VPS_HOST"
log_info "Deployment Path: $DEPLOY_PATH"

# ============================================================================
# VALIDATION
# ============================================================================

log_info "Validating prerequisites..."

# Check SSH key
if [ ! -f "$VPS_SSH_KEY" ]; then
    log_error "SSH key not found: $VPS_SSH_KEY"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed locally. Please install Docker first."
    exit 1
fi

log_success "All prerequisites validated"

# ============================================================================
# BUILD & PUSH PHASE
# ============================================================================

log_info "Building Docker image..."

# Tag image
if [ -n "$REGISTRY" ]; then
    IMAGE_FULL="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
else
    IMAGE_FULL="$IMAGE_NAME:$IMAGE_TAG"
fi

docker build -f "$PROJECT_ROOT/etl-server/Dockerfile" -t "$IMAGE_FULL" "$PROJECT_ROOT"

if [ $? -ne 0 ]; then
    log_error "Failed to build Docker image"
    exit 1
fi

log_success "Docker image built: $IMAGE_FULL"

# Push to registry if specified
if [ -n "$REGISTRY" ]; then
    log_info "Pushing image to registry: $REGISTRY"
    docker push "$IMAGE_FULL"
    
    if [ $? -ne 0 ]; then
        log_error "Failed to push image to registry"
        exit 1
    fi
    
    log_success "Image pushed to registry"
fi

# ============================================================================
# PREPARE VPS
# ============================================================================

log_info "Preparing VPS..."

# SSH command helper
ssh_cmd() {
    ssh -i "$VPS_SSH_KEY" "$VPS_USER@$VPS_HOST" "$@"
}

# Check VPS connectivity
log_info "Testing SSH connection to VPS..."
if ! ssh_cmd "echo 'VPS connection successful'" > /dev/null 2>&1; then
    log_error "Failed to connect to VPS at $VPS_HOST"
    exit 1
fi

log_success "VPS connection successful"

# Create deployment directory
log_info "Creating deployment directory: $DEPLOY_PATH"
ssh_cmd "sudo mkdir -p $DEPLOY_PATH && sudo chown $VPS_USER:$VPS_USER $DEPLOY_PATH"

# ============================================================================
# COPY FILES
# ============================================================================

log_info "Copying project files to VPS..."

# Use rsync if available, otherwise scp
if command -v rsync &> /dev/null; then
    log_info "Using rsync for file transfer..."
    rsync -avz \
        -e "ssh -i $VPS_SSH_KEY" \
        --exclude '.git' \
        --exclude 'node_modules' \
        --exclude '__pycache__' \
        --exclude '.env' \
        --exclude 'docker-compose.yml' \
        "$PROJECT_ROOT/" \
        "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
else
    log_warn "rsync not available, using scp (slower)..."
    # Copy key files
    scp -i "$VPS_SSH_KEY" "$PROJECT_ROOT/docker-compose.etl.yml" \
        "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
    scp -i "$VPS_SSH_KEY" "$PROJECT_ROOT/.env.etl.example" \
        "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/.env.etl.example"
    scp -r -i "$VPS_SSH_KEY" "$PROJECT_ROOT/etl-server" \
        "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
    scp -r -i "$VPS_SSH_KEY" "$PROJECT_ROOT/hms-datalakes" \
        "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
fi

log_success "Files transferred to VPS"

# ============================================================================
# CONFIGURE PRODUCTION ENVIRONMENT
# ============================================================================

log_info "Setting up production configuration..."

# Create production .env file on VPS
log_info "Creating production .env.etl file..."
ssh_cmd "cat > $DEPLOY_PATH/.env.etl << 'EOF'
ETL_ENV=production

# ============================================================================
# POSTGRESQL - HOSPITAL DATA SOURCE
# ============================================================================
DB_HOST=postgres-hospital
DB_PORT=5432
DB_NAME=hms
DB_USER=postgres
DB_PASSWORD=$(openssl rand -base64 32)
DB_TABLE=checkups

POSTGRES_PORT=5435

# ============================================================================
# MINIO - DATA LAKE OBJECT STORAGE
# ============================================================================
MINIO_ROOT_USER=$(openssl rand -base64 20)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)
MINIO_ETL_USER=etluser
MINIO_ETL_PASSWORD=$(openssl rand -base64 32)

MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001

# ============================================================================
# ETL SERVER
# ============================================================================
ETL_SERVER_PORT=9091
ETL_API_KEY=$(openssl rand -base64 32)

# ============================================================================
# SPARK CONFIGURATION
# ============================================================================
SPARK_DRIVER_MEMORY=4g
SPARK_EXECUTOR_MEMORY=4g
SPARK_EXECUTOR_CORES=4

# ============================================================================
# LOGGING
# ============================================================================
LOG_LEVEL=info
EOF"

log_success "Production .env.etl created"

# ============================================================================
# DEPLOY SERVICES
# ============================================================================

log_info "Deploying ETL services..."

# Deploy using docker-compose
deploy_cmd="cd $DEPLOY_PATH && \
    docker-compose -f docker-compose.etl.yml pull && \
    docker-compose -f docker-compose.etl.yml up -d"

ssh_cmd "$deploy_cmd"

if [ $? -ne 0 ]; then
    log_error "Failed to deploy services on VPS"
    exit 1
fi

log_success "Services deployed on VPS"

# ============================================================================
# POST-DEPLOYMENT
# ============================================================================

log_info "Running post-deployment checks..."

# Wait for services to be healthy
log_info "Waiting for services to become healthy..."
sleep 10

# Check ETL Server health
log_info "Checking ETL Server health..."
ssh_cmd "curl -s http://localhost:9091/health > /dev/null && echo 'ETL Server is healthy' || echo 'ETL Server health check failed'"

# ============================================================================
# SUMMARY
# ============================================================================

log_info "Deployment Summary:"
echo ""
echo -e "${BLUE}Deployment Details:${NC}"
echo "  VPS Host: $VPS_HOST"
echo "  Deployment Path: $DEPLOY_PATH"
echo "  Image: $IMAGE_FULL"

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. SSH into VPS: ssh -i $VPS_SSH_KEY $VPS_USER@$VPS_HOST"
echo "  2. Navigate to deployment: cd $DEPLOY_PATH"
echo "  3. View logs: docker-compose -f docker-compose.etl.yml logs -f etl-server"
echo "  4. Check services: docker-compose -f docker-compose.etl.yml ps"
echo "  5. Store credentials: Save .env.etl values in secure location"

echo ""
echo -e "${BLUE}Monitoring:${NC}"
echo "  Restart services: docker-compose -f docker-compose.etl.yml restart"
echo "  Stop services: docker-compose -f docker-compose.etl.yml down"
echo "  View service logs: docker-compose -f docker-compose.etl.yml logs SERVICE_NAME"

echo ""
log_warn "IMPORTANT: Save the credentials from .env.etl in a secure location!"
log_warn "Access the VPS configuration with: ssh -i $VPS_SSH_KEY $VPS_USER@$VPS_HOST"

log_success "VPS Deployment completed successfully!"
