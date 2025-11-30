# Central Proxy Service

The Central Proxy is the **Federation Layer** of the HMS-DLS2 system. It acts as a "Virtual S3 Gateway" and "Metadata Interceptor" that enables Trino to query data across multiple hospital MinIO nodes through a unified interface.

## Architecture

```
                                    ┌─────────────────┐
                                    │     Trino       │
                                    │  (Query Engine) │
                                    └────────┬────────┘
                                             │
                         ┌───────────────────┴───────────────────┐
                         │          Central Proxy                 │
                         │   ┌─────────────┬─────────────────┐   │
                         │   │  Metadata   │   S3 Data       │   │
                         │   │ Interceptor │   Router        │   │
                         │   │ (/iceberg/*) │   (/s3/*)      │   │
                         │   └──────┬──────┴───────┬─────────┘   │
                         │          │              │              │
                         │   ┌──────▼──────┐  ┌───▼───────────┐  │
                         │   │ Credential  │  │ Hospital      │  │
                         │   │ Service     │  │ Lookup        │  │
                         │   │ + Cache     │  │ + Routing     │  │
                         │   └──────┬──────┘  └───────────────┘  │
                         └──────────┼─────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
       ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
       │   Nessie    │       │ Hospital A  │       │ Hospital B  │
       │  (Catalog)  │       │   MinIO     │       │   MinIO     │
       └─────────────┘       └─────────────┘       └─────────────┘
```

## Features

### 1. Metadata Interceptor (`/iceberg/*`)
- **Purpose:** Proxies all Iceberg REST catalog requests to Nessie
- **Credential Injection:** Intercepts `LoadTable` responses and injects STS credentials
- **How it works:**
  1. Trino requests table metadata: `GET /iceberg/v1/namespaces/{ns}/tables/{table}`
  2. Proxy forwards to Nessie
  3. On response, proxy extracts namespace from URL
  4. Looks up approved STS credentials for that namespace from database
  5. Injects `s3.access-key-id`, `s3.secret-access-key`, `s3.session-token` into response config
  6. Returns modified response to Trino

### 2. S3 Data Router (`/s3/*`)
- **Purpose:** Routes S3 data requests to the appropriate hospital MinIO
- **Dynamic Routing:** Parses bucket/path to determine target hospital
- **How it works:**
  1. Trino sends: `GET /s3/{bucket}/path/to/file.parquet`
  2. Proxy extracts bucket name and namespace from path
  3. Looks up hospital's MinIO endpoint
  4. Creates/reuses reverse proxy for that endpoint
  5. Forwards request with Authorization header intact

### 3. Credential Caching
- **TTL-based caching** for STS credentials (default: 5 minutes)
- **Hospital lookup caching** (default: 10 minutes)
- **Auto-expiration checks** before using cached credentials

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/ready` | GET | Readiness check |
| `/iceberg/*` | ANY | Iceberg REST catalog proxy (Nessie) |
| `/s3/*` | ANY | S3 data proxy (Hospital MinIO) |
| `/s3-direct/*` | ANY | Direct S3 routing with `?namespace=` param |
| `/admin/hospitals` | GET | List all hospitals |
| `/admin/credentials/:namespace` | GET | Check credentials for namespace |
| `/admin/cache/invalidate` | POST | Clear all caches |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PROXY_PORT` | 8081 | Proxy listen port |
| `PROXY_ENV` | development | Environment (development/production) |
| `LOG_LEVEL` | info | Log level (debug/info/warn/error) |
| `DB_HOST` | localhost | Central PostgreSQL host |
| `DB_PORT` | 5432 | Central PostgreSQL port |
| `DB_NAME` | centraldb | Central database name |
| `DB_USER` | central | Database username |
| `DB_PASSWORD` | centralpass | Database password |
| `DB_SSL_MODE` | disable | PostgreSQL SSL mode |
| `NESSIE_ENDPOINT` | http://localhost:19120 | Nessie server URL |
| `CACHE_CREDENTIAL_TTL` | 300 | Credential cache TTL (seconds) |
| `CACHE_HOSPITAL_TTL` | 600 | Hospital cache TTL (seconds) |

## Trino Configuration

The Trino Iceberg catalog must be configured to use the Central Proxy:

```properties
# trino/catalog/iceberg.properties
connector.name=iceberg
iceberg.catalog.type=rest

# Metadata via Central Proxy
iceberg.rest-catalog.uri=http://central-proxy:8081/iceberg

# Enable vended credentials (accept injected STS keys)
iceberg.rest-catalog.vended-credentials-enabled=true

# S3 data via Central Proxy
fs.native-s3.enabled=true
s3.endpoint=http://central-proxy:8081/s3
s3.path-style-access=true
s3.region=us-east-1
```

## Running Locally

```bash
# With Docker Compose (recommended)
docker-compose up -d central-proxy trino

# Or run directly
cd central-proxy
go run ./cmd/server
```

## Testing

```bash
# Run integration tests
./test-central-proxy.sh

# Manual tests
# 1. Health check
curl http://localhost:8081/health

# 2. List hospitals
curl http://localhost:8081/admin/hospitals

# 3. Check credentials for a namespace
curl http://localhost:8081/admin/credentials/{namespace}

# 4. Query via Trino
trino --server localhost:8082 --catalog iceberg \
      --execute "SELECT * FROM {namespace}.{table} LIMIT 10"
```

## Data Flow

### Query Execution Flow

1. **Researcher submits Trino query:**
   ```sql
   SELECT * FROM iceberg.hospital_a.patients LIMIT 10
   ```

2. **Trino requests table metadata:**
   ```
   GET /iceberg/v1/namespaces/hospital_a/tables/patients
   ```

3. **Central Proxy:**
   - Forwards to Nessie
   - Receives table metadata
   - Looks up approved credentials for `hospital_a`
   - Injects STS credentials into response

4. **Trino receives metadata with credentials:**
   ```json
   {
     "metadata-location": "s3://hospital-data/iceberg/hospital_a/patients/...",
     "config": {
       "s3.access-key-id": "ASIA...",
       "s3.secret-access-key": "...",
       "s3.session-token": "..."
     }
   }
   ```

5. **Trino requests data files:**
   ```
   GET /s3/hospital-data/iceberg/hospital_a/patients/data/file.parquet
   Authorization: AWS4-HMAC-SHA256 ...
   ```

6. **Central Proxy:**
   - Extracts namespace from path
   - Looks up Hospital A's MinIO endpoint
   - Forwards request to Hospital A's MinIO

7. **Data returned to Trino → Query results to researcher**

## Security Considerations

- **Read-only database access:** Proxy only reads credentials, never writes
- **Credential caching:** Short TTL prevents stale credentials
- **No credential storage:** Credentials flow through, not stored
- **Hospital isolation:** Each request routed only to authorized hospital
- **STS temporal credentials:** Auto-expire based on original grant

## Troubleshooting

### Common Issues

1. **No credentials found:**
   - Ensure data access request is approved
   - Verify hospital has completed handshake
   - Check namespace matches exactly

2. **S3 routing failures:**
   - Verify hospital MinIO endpoint is reachable
   - Check bucket name / namespace mapping

3. **Nessie connection issues:**
   - Verify NESSIE_ENDPOINT is correct
   - Check Nessie is running and healthy

### Debug Logs

Set `LOG_LEVEL=debug` for detailed request/response logging.
