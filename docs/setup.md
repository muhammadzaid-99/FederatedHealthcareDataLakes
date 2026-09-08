# Running the project locally

A full local run means bringing up two sides of the system: the central plane, and one
hospital node with its own storage and ETL runner. The Docker Compose files cover the
infrastructure; the Go services and the two Next.js apps are run from source.

## Prerequisites

- Docker and Docker Compose
- Go 1.25 or newer (the four Go modules declare 1.23, 1.23, 1.24.7 and 1.25)
- Node.js 18 or newer, for the two Next.js apps
- About 6 GB of free memory. Trino is capped at 2 GB and each Spark job asks for 2 GB by
  default

You do not need Java, Python or Spark on the host. They live inside the `etl-server` image.

## 1. Central plane infrastructure

```bash
cp .env.example .env
docker compose up -d
```

This starts PostgreSQL for the central backend (5432), PostgreSQL for Nessie (5433),
PostgreSQL for the node backend (5434), Nessie (19120), `central-proxy` (8081) and Trino
(8082). The application services and the frontends are present in `docker-compose.yml` but
commented out, so run them from source as below.

Check that Nessie and the proxy are up:

```bash
curl http://localhost:19120/api/v2/config
curl http://localhost:8081/health
```

## 2. Hospital side infrastructure and the ETL runner

```bash
cp .env.etl.example .env.etl
docker compose -f docker-compose.etl.yml --env-file .env.etl up -d
```

This starts the hospital's source PostgreSQL (5435), MinIO (9000, console on 9001), a MinIO
client container that creates the `hospital-data` and `hospital-metadata` buckets, and
`etl-server` (9091). The `etl-server` image builds from the repository root because it
copies the Python scripts and the JDBC driver out of `hms-datalakes/hospital_etl/`.

```bash
curl http://localhost:9091/health
```

MinIO starts with the root account from `.env.etl` (`MINIO_ROOT_USER` and
`MINIO_ROOT_PASSWORD`). If you want a separate least privilege ETL account,
`local-infra/docker-compose.yml` shows how it is provisioned from
`hms-datalakes/hospital_etl/policies/etl-user.json`. Whichever account you use, its
credentials are entered later in the node UI rather than set as environment variables on
`node-backend`.

`local-infra/` is an alternative single stack that runs MinIO, Nessie, Trino and
`etl-server` together and exposes them through a Cloudflare Tunnel. It expects
`NESSIE_JDBC_URL`, `NESSIE_DB_USER` and `NESSIE_DB_PASSWORD` for an external Nessie
database, and is what the deployed setup uses. For a plain local run, the two compose files
above are enough.

## 3. Seed the hospital database

`prisma/` holds the schema and seed for the upstream hospital management system that the
ETL extracts from.

```bash
cd prisma
npm install
export DATABASE_URL=postgresql://postgres:12345678@localhost:5435/hms
npx prisma db push
npx tsx seed.ts
```

`prisma.config.ts` reads `DATABASE_URL` from the environment or a `.env` file next to it,
and there are no committed migrations, so `db push` is the way to create the schema. The
seed clears the tables first, so do not point it at anything you care about.

The extraction stage does not read these tables directly. It reads a denormalized `checkups`
view over them, exposing `checkup_id`, `department_name`, `checkup_created_at`,
`patient_dob`, and JSONB `prescription` and `test_recommendations`. That view belongs to the
hospital's own system rather than to this repository, so create it before running a job.

## 4. Central backend

```bash
cd central-backend
go run ./cmd/server
```

Listens on 8080. Configuration comes from the environment, with `.env` loaded if present;
`internal/config/config.go` holds every key and its default. The ones that matter locally
are the `DB_*` group, `NESSIE_ENDPOINT`, `PROXY_URL` and `PROXY_INTERNAL_API_KEY`. That
last value has to match `INTERNAL_API_KEY` on `central-proxy`, which
`docker-compose.yml` sets to `dev-internal-api-key-change-in-production`.

On first start the service creates an admin account from `ADMIN_USERNAME` and
`ADMIN_PASSWORD`, defaulting to `admin` and `admin123`. Change these before exposing the
service anywhere.

## 5. Node backend

```bash
cd node-backend
go run ./cmd/server
```

Listens on 9090. It needs `NODE_DB_*` pointing at the node PostgreSQL on 5434,
`CENTRAL_BACKEND_URL` pointing at the central backend, and `ETL_SERVER_URL` plus
`ETL_INTERNAL_API_KEY` matching what `etl-server` was started with. Defaults are in
`node-backend/internal/config/config.go`.

MinIO endpoint, MinIO credentials, bucket, Nessie namespace and the ETL schedule are not
environment variables. They are entered through `node-web` and stored in the node database
as `NodeConfig` and `ETLConfig`, because each hospital configures its own storage.

## 6. Frontends

```bash
cd central-web/app && npm install && npm run dev   # port 3000
cd node-web && npm install && npm run dev          # port 3001
```

`central-web/app` reads `NEXT_PUBLIC_API_BASE` (default `http://localhost:8080/api/v1`) and
`NEXT_PUBLIC_PROXY_API` (default `http://localhost:8081`). `node-web` reads
`NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:9090`. The defaults match the ports
above, so no configuration is needed for a local run.

`central-web/admin` is a small static admin page served by the central backend at `/admin`,
separate from the Next.js app.

## 7. Walking through the system

1. Sign in to the admin dashboard and register a hospital, then approve it. The hospital is
   assigned a Nessie namespace and node credentials.
2. In `node-web`, save the node configuration with those credentials and run the handshake,
   then fill in the ETL configuration: source database, MinIO endpoint and credentials,
   bucket, and schedule.
3. Trigger an ETL job from `node-web`. Follow it through the extraction, normalization and
   validation stages. On success the `checkups` Iceberg table appears in the hospital's
   MinIO bucket and in Nessie under the hospital namespace.
4. Register a requestor, approve it from the admin dashboard, and create a data access
   request against the hospital.
5. Back in `node-web`, approve the request with a set of departments and a date range. This
   is where the scoped STS credentials are minted and sent to the central plane.
6. In the requestor portal, open the query builder, pick the approved access, choose
   departments and dates, and run the query. It goes out through Trino and the proxy to the
   hospital MinIO.

## Trino configuration

`trino/catalog/iceberg.properties` points Trino's REST catalog and S3 endpoint at
`central-proxy`, with `iceberg.rest-catalog.vended-credentials-enabled=true` so the
credentials the proxy returns with the table metadata are used for the object reads. The
file also carries commented lines for the deployed proxy on Heroku. There are no static S3
credentials in it, on purpose.

## Tests

The Go modules carry unit tests, closest to the parts where a mistake is least visible:
policy generation and date range collapsing in `node-backend`, namespace parsing and the S3
router in `central-proxy`, and configuration, models, auth and the query builder in
`central-backend`.

```bash
cd central-backend && go test ./...
cd central-proxy   && go test ./...
cd node-backend    && go test ./...
```
