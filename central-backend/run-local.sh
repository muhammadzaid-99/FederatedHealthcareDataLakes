#!/bin/bash

# Helper script to run the Go server locally (outside Docker)
# This temporarily uses .env.local which has localhost hostnames

set -e

echo "🔧 Running Go server in LOCAL mode (outside Docker)"
echo "   Using .env.local with localhost hostnames"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local not found"
    echo "   Run this from the project root directory"
    exit 1
fi

# Backup current .env
if [ -f .env ]; then
    echo "📦 Backing up .env to .env.docker"
    cp .env .env.docker
fi

# Use local env
echo "🔄 Switching to .env.local"
cp .env.local .env

echo "✅ Environment configured for local development"
echo ""
echo "Starting Go server..."
echo "Press Ctrl+C to stop"
echo ""

# Run the server
go run ./cmd/server

# Cleanup function
cleanup() {
    echo ""
    echo "🔄 Restoring .env.docker"
    if [ -f .env.docker ]; then
        mv .env.docker .env
        echo "✅ Restored Docker configuration"
    fi
}

# Register cleanup on exit
trap cleanup EXIT
