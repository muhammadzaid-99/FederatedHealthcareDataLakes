FROM ghcr.io/projectnessie/nessie:latest

# Heroku assigns a dynamic PORT — Nessie/Quarkus reads QUARKUS_HTTP_PORT.
# This entrypoint bridges the two.
COPY entrypoint.sh /entrypoint.sh

USER root
RUN chmod +x /entrypoint.sh
USER nobody

ENTRYPOINT ["/entrypoint.sh"]
