# ETL Server

Standalone ETL pipeline executor for the HMS federated data lakes project.

## Overview

The ETL server is a standalone Go service that executes ETL (Extract, Transform, Load) jobs by invoking Python scripts. It is designed to be independently deployable and has no database dependencies — all configuration and credentials are passed in each request.

## Architecture

- **No database**: All job state is maintained in memory. The caller (node-backend) is responsible for persisting job results.
- **Stateless requests**: Each job trigger must include all credentials, endpoints, and configuration needed to execute.
- **Internal API key auth**: All endpoints (except `/health`) are protected by an internal API key, following the same pattern used between central-backend and central-proxy.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/api/v1/jobs` | API Key | Trigger a new ETL job |
| GET | `/api/v1/jobs/:id` | API Key | Poll job status by ID |
| POST | `/api/v1/test-connection` | API Key | Test database connectivity |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ETL_SERVER_PORT` | `9091` | Port to listen on |
| `ETL_SERVER_ENV` | `development` | Environment (`development` / `production`) |
| `ETL_INTERNAL_API_KEY` | (empty) | Shared secret for authenticating requests from node-backend |

## Running Locally

```bash
cd etl-server
ETL_INTERNAL_API_KEY=my-secret-key go run ./cmd/server
```

## Building

```bash
cd etl-server
go build -o etl-server ./cmd/server
```
