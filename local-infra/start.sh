#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Start local infrastructure + ngrok tunnels
# Usage: ./start.sh          (just services)
#        ./start.sh --tunnel  (services + ngrok tunnels)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Starting local infrastructure (MinIO, Nessie, Trino, ETL Server)..."
docker compose up -d --build

echo ""
echo "==> Waiting for services to be healthy..."
sleep 5

echo ""
echo "Service status:"
echo "  MinIO API:     http://localhost:9000"
echo "  MinIO Console: http://localhost:9001  (admin / admin12345)"
echo "  Nessie:        http://localhost:19120"
echo "  Trino:         http://localhost:8082"
echo "  ETL Server:    http://localhost:9091"

if [[ "${1:-}" == "--tunnel" ]]; then
    echo ""
    echo "==> Starting Cloudflare Tunnel..."
    if ! command -v cloudflared &>/dev/null; then
        echo "ERROR: cloudflared not installed."
        echo "Install: curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb"
        exit 1
    fi
    echo "    Tunneling: minio, nessie, trino, etl-server"
    echo "    Press Ctrl+C to stop tunnel (containers keep running)"
    echo ""
    cloudflared tunnel run
fi
