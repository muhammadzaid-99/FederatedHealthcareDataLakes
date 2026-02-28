#!/bin/sh
# Bridge Heroku's dynamic PORT to Quarkus's QUARKUS_HTTP_PORT
export QUARKUS_HTTP_PORT="${PORT:-19120}"

# Launch Nessie (the original Quarkus entrypoint)
exec /deployments/run-java.sh
