#!/bin/bash

# Quick Start Script for HMS-DLS2 Monorepo
# This script helps you get all services running quickly

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  HMS-DLS2 Quick Start Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if docker compose is available
if ! command -v docker compose &> /dev/null; then
    echo -e "${YELLOW}docker compose command not found. Please install Docker Compose.${NC}"
    exit 1
fi

# Step 1: Install Node.js dependencies
echo -e "${GREEN}Step 1/3: Installing Node.js dependencies...${NC}"
echo ""

if [ ! -d "central-web/app/node_modules" ]; then
    echo "Installing central-web dependencies..."
    cd central-web/app
    npm install --silent
    cd ../..
    echo -e "${GREEN}✓ central-web dependencies installed${NC}"
else
    echo -e "${GREEN}✓ central-web dependencies already installed${NC}"
fi

if [ ! -d "node-web/node_modules" ]; then
    echo "Installing node-web dependencies..."
    cd node-web
    npm install --silent
    cd ..
    echo -e "${GREEN}✓ node-web dependencies installed${NC}"
else
    echo -e "${GREEN}✓ node-web dependencies already installed${NC}"
fi

echo ""

# Step 2: Start Docker services
echo -e "${GREEN}Step 2/3: Starting Docker services...${NC}"
echo ""

docker compose up -d

echo ""
echo -e "${GREEN}✓ All services started${NC}"
echo ""

# Step 3: Wait for services to be healthy
echo -e "${GREEN}Step 3/3: Waiting for services to be ready...${NC}"
echo ""

max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Central backend is ready!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    echo "Waiting for backend... ($attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${YELLOW}Warning: Backend took longer than expected to start${NC}"
    echo "Check logs with: docker compose logs central-backend"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 All services are running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Access the applications at:"
echo ""
echo -e "  ${BLUE}Central Backend API:${NC}      http://localhost:8080"
echo -e "  ${BLUE}Central Admin Portal:${NC}    http://localhost:3000"
echo -e "  ${BLUE}Hospital Node Portal:${NC}    http://localhost:3001"
echo -e "  ${BLUE}RabbitMQ Management:${NC}     http://localhost:15672"
echo -e "  ${BLUE}Nessie Catalog:${NC}          http://localhost:19120"
echo ""
echo "Default credentials:"
echo "  Admin: admin / admin123"
echo ""
echo "Next steps:"
echo "  1. Register a hospital at http://localhost:3000/register"
echo "  2. Login as admin and approve the hospital"
echo "  3. Use the issued credentials at http://localhost:3001/handshake"
echo ""
echo "To stop all services:"
echo "  docker compose down"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To run tests:"
echo "  ./test-e2e.sh"
echo ""
