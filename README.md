# Federated Data Lakes for Healthcare Centres

A federated data lake that lets an approved researcher run a single SQL query across
several hospitals at once, without any hospital handing over a copy of its data.

Healthcare in Pakistan runs on disconnected systems. Records sit in separate hospital
platforms, so there is no unified view for research or for planning and oversight. The
usual fix is to copy everything into one central warehouse, which asks every hospital to
give up custody of its own records, and that is normally where the idea stops. This project
takes the other route: the data stays on the hospital's own infrastructure, and what moves
between institutions is permission rather than records.

Each hospital keeps its own database and its own object storage, publishes its records as
FHIR R5 in an open table format, and decides for itself who may read which parts of them. A
central service holds identity, the hospital registry, and access requests, and stores no
clinical records at all. When a hospital approves a request, it issues nothing more than
short lived credentials scoped to exactly what was approved. Queries execute against the
hospitals' own storage, and results come back combined.

Every component of the stack is open source and runs under Docker, so a hospital can run
its side on its own hardware rather than depending on a managed cloud service. It is a
final year project, and the upstream clinical schema it ingests from is modeled on
Pakistani hospital records, using CNIC as the patient identifier.

## Overview

There are three parties.

- A **hospital** runs a node service, its own PostgreSQL, and its own MinIO object store.
  It publishes its clinical records into an Apache Iceberg table inside its own bucket, and
  decides case by case who may read which parts of it.
- The **central plane** knows which hospitals exist, who is asking for data, and which
  requests have been approved. It never sees the records themselves.
- A **requestor**, typically a researcher, asks specific hospitals for specific departments
  over a specific date range, and once approved can query exactly that and nothing more.

Trino executes the federated query. A proxy sits between Trino and the hospitals, resolving
which hospital and which grant each request belongs to, and re-signing every object read
against the right hospital's storage.

## What it does

- A hospital registers, is approved by an administrator, and gets its own namespace in the
  shared catalog.
- The hospital's ETL pipeline reads its operational database on a schedule, converts each
  checkup into a FHIR R5 Bundle, validates it, and publishes the result as an Iceberg table
  in its own object store. Records that fail validation are kept in a separate errors table
  rather than dropped.
- A researcher registers, is approved, and submits a data access request naming hospitals,
  departments, and a purpose.
- Each hospital sees the request in its own dashboard and answers independently. One
  request can be approved by one hospital, rejected by another, and still be usable for the
  part that was approved.
- On approval, the hospital mints temporary storage credentials that can only read the
  approved departments and dates, and sends them to the central plane. They expire on their
  own.
- The researcher builds a query in the browser by picking approved access, departments,
  columns and a date range. The server writes the SQL, fans it out across the approved
  hospitals, and returns one combined result set.
- An attempt to read a department or a date outside the approval fails twice over: the
  server refuses to build the query, and the storage credentials would not have permitted
  the read anyway.

## Key technical ideas

### Turning an approval into a storage permission

**The problem.** A hospital approves access to "Cardiology and Radiology, for 2024". That
sentence has to become something a storage system can enforce, otherwise the guarantee is
only as good as the application code in front of it.

**The approach.** The Iceberg table is partitioned by `department_name` and `checkup_date`,
so the approved scope is literally part of the object key:

```
iceberg/{namespace}/{table}/data/department_name=Cardiology/checkup_date=2024-03-11/...
```

On approval, the node builds an IAM policy naming one resource ARN per approved department
and date, and calls MinIO's STS `AssumeRole` with it as an inline policy. What comes back
is a temporary key that physically cannot read anything else.

**Why it matters.** The partitioning scheme was chosen for the authorization model, not
just for query performance. That is what lets the access decision be enforced by the object
store rather than trusted to the query layer.

### Fitting a grant into 2048 bytes

**The problem.** MinIO caps an inline STS policy at 2048 bytes. Two departments over a full
year expands to 730 resource ARNs, which is far past the limit, and a policy that gets
silently truncated or rejected at the wrong moment is worse than a slow one.

**The approach.** Before the ARNs are generated, the date list is collapsed: a complete
month becomes `YYYY-MM-*` and a complete year becomes `YYYY-*`. Two departments over a full
year drops to two ARNs. If a request still does not fit, the approval is refused with a
message telling the operator to select whole months or a narrower range.

**Why it matters.** The wildcard is only ever applied when every day in the period is
included, so the collapsed policy grants exactly what the expanded one would have. The
failure case is an honest refusal rather than a grant that quietly differs from what was
approved.

### Telling the proxy which grant a query belongs to

**The problem.** Trino connects to an Iceberg REST catalog with settings fixed at startup.
It cannot attach a per query header. But two researchers can hold two different grants over
the same hospital, with different departments and different date windows, so the proxy has
to distinguish them on every single request.

**The approach.** The identity is carried in the one value the query itself controls: the
schema name. The backend emits `iceberg."hospital_abc123::AKIA...EXAMPLE"."checkups"`, and
the proxy splits the namespace on `::` to recover both the hospital and the access key. The
lookup then matches on the hospital, an approved status, and that exact key, so an unknown
or revoked key gets a `403` from the catalog.

**Why it matters.** It keeps the credential decision inside the proxy, where it belongs,
without patching Trino or giving up on vended credentials. It is an unusual trick, and it
is the piece that makes multi-tenant federation work over an off the shelf query engine.

### Reading objects through a tunnel

**The problem.** Trino's object reads are signed with SigV4, and the deployment puts a
Cloudflare Tunnel between the proxy and each hospital. Anything that adds or normalizes an
HTTP header on the way invalidates a header based signature, and the read fails with an
error that says nothing useful about why.

**The approach.** The proxy does not forward Trino's signature. It resolves the grant,
presigns the request against the hospital's MinIO with a fifteen minute expiry, and strips
`authorization`, `x-amz-*` and `host` from the inbound request before sending it on. The
entire signature travels in the query string.

**Why it matters.** A presigned URL is immune to header rewriting, so the read survives any
intermediary on the path. It also means Trino never holds a credential that works anywhere
except through the proxy.

### Never accepting SQL from a user

**The problem.** A query builder that lets researchers filter across hospitals is one bad
concatenation away from letting them read a hospital that never approved them.

**The approach.** The API takes structure, not SQL: a table, a column list, a row limit, and
one selection per hospital. Table and column names are checked against
`^[a-zA-Z_][a-zA-Z0-9_]*$` and dates against `^\d{4}-\d{2}-\d{2}$`. Every selection is
resolved to a stored approval, checked for ownership and approved status, and its
departments must be a subset of what was granted and its dates inside the granted range.
Only then does the server assemble one `SELECT` per hospital and join them with `UNION ALL`.

**Why it matters.** There is no code path where user text reaches Trino as SQL, and the
authorization check happens on the same object that later supplies the storage credentials,
so the two can't drift apart.

### Pulling work instead of pushing it

**The problem.** The first design used RabbitMQ to push new access requests out to
hospitals. That meant every hospital had to hold an open connection to central
infrastructure and operate a broker to receive a handful of messages a day.

**The approach.** Nodes now poll `GET /api/v1/nodes/requests` with their service token and
create local records for anything they have not seen. Deduplication is on the central
request ID, so a repeated poll is harmless.

**Why it matters.** It removes a piece of infrastructure from every hospital deployment and
turns an inbound connection into an outbound one, which is a much easier thing to get
through a hospital network. The broker code is still in the tree, disabled, because the
design decision is part of the history.

## Architecture

The system splits along the trust boundary. Everything that touches clinical data runs
inside the hospital; everything shared runs centrally and holds only metadata.

A query starts in the requestor's browser and reaches the data through four hops. The
central backend validates the request against stored approvals and builds the SQL. Trino
receives that SQL and asks the central proxy for the table, and the proxy answers as an
Iceberg REST catalog by looking the table up in Nessie and returning the metadata together
with the grant's temporary credentials. Trino then issues object reads for the data files,
which arrive back at the proxy, get routed to the hospital that owns the namespace, and are
presigned against that hospital's MinIO. The proxy is the only component that talks to more
than one hospital, and even it never stores what it moves.

| Component | Responsibility |
|-----------|----------------|
| `central-backend` | Accounts and sessions for admins, hospitals and requestors. Hospital registry, access requests, storage of vended credentials, and server side query construction. |
| `central-proxy` | Iceberg REST catalog over Nessie, credential vending to Trino, and a virtual S3 gateway that routes and presigns object reads to the correct hospital. |
| `central-web` | Admin dashboard and the requestor portal, including the query builder. |
| `node-backend` | Runs at the hospital. Handshake and token refresh with the central plane, request polling, STS credential minting on approval, and the ETL scheduler. |
| `node-web` | Hospital operator UI for node setup, ETL configuration, and approving or rejecting requests. |
| `etl-server` | Stateless job runner that executes the Spark pipeline and reports stage by stage progress. |
| `hms-datalakes/hospital_etl` | The PySpark pipeline: JDBC extraction, FHIR R5 transformation, validation, and publication to Iceberg. |
| `prisma` | Schema and seed data for the upstream hospital management system the pipeline reads from. |
| Nessie | Versioned catalog holding the Iceberg table pointers for every hospital namespace. |
| Trino | Executes the federated query across hospital namespaces. |
| MinIO | One per hospital. Object storage for its Iceberg tables, and the STS endpoint that issues scoped credentials. |

[docs/architecture.md](docs/architecture.md) covers the approval path, the query path, and
the credential mechanics in detail.

## Technology stack

| Area | Technology |
|------|------------|
| Backend services | Go, Gin, GORM, logrus |
| Authentication | JWT (`golang-jwt/v5`), bcrypt, httpOnly cookie sessions, shared internal API keys |
| Object storage and credentials | MinIO, AWS SDK for Go v2 (S3, STS, presigning) |
| Table format and catalog | Apache Iceberg, Project Nessie (Core API v2) |
| Query engine | Trino 464, `trino-go-client` |
| Data pipeline | PySpark 3.5, PostgreSQL JDBC, `fhir.resources` with pydantic for FHIR R5 validation |
| Databases | PostgreSQL for the central plane, each node, and Nessie's version store |
| Frontends | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Radix UI |
| Upstream schema | Prisma 7 |
| Infrastructure | Docker Compose, Cloudflare Tunnel, Heroku |

## Running the project

Full instructions, including the walkthrough from hospital registration to a federated
query, are in [docs/setup.md](docs/setup.md). The short version:

```bash
# Central plane: PostgreSQL x3, Nessie, central-proxy, Trino
cp .env.example .env
docker compose up -d

# Hospital side: source PostgreSQL, MinIO, buckets, etl-server
cp .env.etl.example .env.etl
docker compose -f docker-compose.etl.yml --env-file .env.etl up -d

# Application services, each in its own terminal from the repository root
(cd central-backend && go run ./cmd/server)          # 8080
(cd node-backend    && go run ./cmd/server)          # 9090
(cd central-web/app && npm install && npm run dev)   # 3000
(cd node-web        && npm install && npm run dev)   # 3001
```

Then seed the hospital's source database from `prisma/`, register a hospital in the admin
dashboard, and follow the walkthrough in the setup guide.

You need Docker, Go 1.25 or newer, and Node.js 18 or newer. Java, Python and Spark are only
needed inside the `etl-server` image, which builds from the repository root because it
copies the pipeline scripts out of `hms-datalakes/`.

The Go services and the frontends are commented out in `docker-compose.yml` and run from
source, which is how they were developed.

## Configuration

Every Go service reads its configuration from the environment, loading a `.env` file if one
is present, and each has a single `internal/config/config.go` listing every key with its
default. `.env.example` and `.env.etl.example` cover the two Docker stacks.

Two things are worth knowing before the first run:

- `PROXY_INTERNAL_API_KEY` on the central backend has to match `INTERNAL_API_KEY` on the
  proxy, and `ETL_INTERNAL_API_KEY` has to match between the node backend and the ETL
  server. When either key is left empty, the middleware allows all requests, which is
  intended for local development only.
- A hospital's MinIO endpoint, credentials, bucket, Nessie namespace and ETL schedule are
  not environment variables. They are entered in `node-web` and stored in the node's own
  database, because each hospital configures its own storage.

## Project structure

| Path | Contents |
|------|----------|
| `central-backend/` | Central control plane. Handlers, middleware, services including the query builder, GORM models |
| `central-proxy/` | Iceberg REST catalog, S3 router, credential and Trino services |
| `central-web/` | Next.js requestor portal and admin dashboard, plus a static admin page served by the backend |
| `node-backend/` | Hospital node service. STS policy building, request sync, ETL scheduling |
| `node-web/` | Next.js hospital operator UI |
| `etl-server/` | Go job runner and its combined Go, Python and Spark image |
| `hms-datalakes/hospital_etl/` | PySpark pipeline scripts and MinIO policies |
| `prisma/` | Upstream hospital management schema and seed data |
| `trino/`, `local-infra/`, `nessie-heroku/` | Trino catalog and node config, the tunneled local stack, and the Nessie deployment image |
| `docs/` | Architecture, setup, ETL pipeline, and the requestor API reference |

## Engineering highlights

- An Iceberg REST catalog implemented from scratch in Go on top of Nessie, including table
  resolution through the Nessie Core API v2, metadata fetch and rewriting, and credential
  vending in the `LoadTable` response.
- A partition layout designed backwards from the authorization model, so an access grant can
  be expressed as an S3 resource policy instead of a filter in application code.
- Date range collapsing that keeps generated IAM policies inside MinIO's 2048 byte inline
  limit without widening what the policy actually grants.
- A virtual S3 gateway that resolves the owning hospital per request and presigns reads, so
  object access survives header rewriting intermediaries.
- Structured query construction with identifier allowlists and subset checks against stored
  approvals, so no user supplied text ever reaches the query engine as SQL.
- Service to service authentication with a client credentials grant and stored node tokens
  refreshed five minutes ahead of expiry, separate from the cookie sessions used by browsers.
- A three stage Spark pipeline that validates FHIR R5 bundles per partition and keeps
  rejects in a parallel errors table, so a bad record does not fail an entire run.
- Unit tests over the parts where a mistake would be least visible: policy generation, date
  range collapsing, namespace parsing, the S3 router, and the query builder.

## Further documentation

- [docs/architecture.md](docs/architecture.md): components, the approval path, the query
  path, and the credential mechanics
- [docs/setup.md](docs/setup.md): running the whole system locally, end to end
- [docs/etl-pipeline.md](docs/etl-pipeline.md): the Spark stages, the FHIR output, and the
  ETL server API
- [docs/requestor-api.md](docs/requestor-api.md): the requestor facing HTTP API

## Project status

The federated query path works end to end: a hospital publishes an Iceberg table into its
own storage, approves a scoped request, and a researcher runs a query that reads exactly
that scope through Trino and the proxy. The central plane, the hospital node service and
its UI, the ETL pipeline and both frontends are implemented, and the stack has been run
locally under Docker Compose as well as deployed with Heroku, a hosted PostgreSQL, and a
Cloudflare Tunnel fronting the hospital side.

It is a research and demonstration system rather than a clinical deployment, and work
continues on the operational side.
