# Architecture

This document describes how the components fit together, and what happens on the two paths
that matter: the approval path, where a requestor obtains access to a hospital's data, and
the query path, where an approved query reaches data that never leaves the hospital.

## Design constraint

The system is built around one constraint: a hospital's clinical data must stay in
infrastructure the hospital controls. Each hospital runs its own PostgreSQL source
database, its own MinIO object store, and its own node service. The central plane never
stores or caches clinical records. What it stores is identity, a registry of hospitals,
access requests, and the short lived credentials that hospitals hand back when they approve
a request.

Most of the rest of the design follows from that. Because there is no central copy of the
data, queries have to execute against many object stores at once, which is why the query
engine is Trino and the table format is Iceberg. Because the central plane should not hold
permanent hospital credentials, access is granted as temporary MinIO STS credentials scoped
by IAM policy. And because Trino has to reach hospital object stores it has no direct
knowledge of, there is a proxy between Trino and the hospitals.

## Components

| Component | Language | Responsibility |
|-----------|----------|----------------|
| `central-backend` | Go (Gin, GORM) | Identity and registry. Admin, hospital and requestor accounts, hospital registration and approval, data access requests, storage of vended credentials, and server side query construction. |
| `central-proxy` | Go (Gin) | Federation layer. Implements an Iceberg REST catalog on top of Nessie, vends per grant S3 credentials to Trino, and acts as a virtual S3 gateway that routes and re-signs object reads to the correct hospital MinIO. Also fronts Trino for the backend. |
| `central-web` | Next.js 14, plus a static admin page | Admin dashboard and requestor portal: registration, requests, and the query builder. |
| `node-backend` | Go (Gin, GORM) | Runs at the hospital. Registers the node with the central plane, pulls pending access requests, generates scoped STS credentials on approval, and drives the ETL scheduler. |
| `node-web` | Next.js 14 | Hospital operator UI. Node and ETL configuration, request review and approval, job history. |
| `etl-server` | Go, with Python and PySpark | Stateless job runner. Executes the three stage Spark pipeline as subprocesses and reports progress back to `node-backend`. |
| `hms-datalakes/hospital_etl/scripts` | Python (PySpark) | The pipeline itself: JDBC extraction, FHIR R5 transformation, validation and publication to Iceberg. |
| Nessie | Service | Versioned catalog backend. Holds the Iceberg table pointers for every hospital namespace. |
| Trino | Service | Federated SQL execution across hospital namespaces. |
| MinIO | Service, one per hospital | Object storage for the hospital's Iceberg tables, and the STS endpoint that issues scoped credentials. |
| `prisma` | Prisma 7 | Schema and seed data for the upstream hospital management system that the ETL reads from. |

## The approval path

1. A hospital registers through `central-web`, an admin approves it, and it is assigned a
   Nessie namespace and a set of node client credentials.
2. The hospital's `node-backend` performs a handshake with the central plane and from then
   on authenticates with a JWT obtained through the client credentials grant at
   `POST /api/v1/auth/node/token`. The token is cached in the node database and refreshed
   five minutes before expiry.
3. A requestor registers, is approved by an admin, and creates a data access request naming
   one or more hospitals, a set of departments, and a purpose.
4. Each hospital node polls `GET /api/v1/nodes/requests` and creates a local record for
   requests it has not seen before. This replaced an earlier RabbitMQ push design. The
   broker code is still present but disabled; pull removed the need for every hospital to
   hold an open connection to central infrastructure.
5. A hospital operator approves the request in `node-web`, choosing the departments and the
   date range to grant. `node-backend` builds an IAM policy for exactly that scope, calls
   MinIO STS `AssumeRole` with it, and receives temporary credentials.
6. The node posts the outcome back to `POST /api/v1/requests/{id}/responses`. On approval
   the body carries the access key, secret, session token, expiry, and the granted
   departments and date range, which the central plane stores on the response record. If
   the callback fails, the local approval still stands and can be re-sent.

### Scoping access with partitions

The published Iceberg table is partitioned by `department_name` and `checkup_date`, so a
row's scope is visible in its object key:

```
iceberg/{namespace}/{table}/data/department_name={dept}/checkup_date={date}/...
```

That is what makes a grant expressible as an S3 policy. `BuildIcebergAccessPolicy` in
`node-backend/internal/sts/policy.go` emits three statements: `ListBucket` restricted by
prefix, `GetObject` on the table metadata, and `GetObject` on one resource ARN per approved
department and date combination. Nothing outside the grant is reachable, even with the
credentials in hand.

MinIO caps an inline STS policy at 2048 bytes, which a day by day expansion exceeds
quickly. `OptimizeDateRange` collapses a complete month into `YYYY-MM-*` and a complete
year into `YYYY-*` before the ARNs are generated. If the policy is still too large, the
approval fails with a message telling the operator to pick whole months or a narrower
range, rather than silently granting something different from what was asked.

## The query path

A requestor never writes SQL. The UI asks for a table, optional columns, a row limit, and
one selection per hospital, where a selection names an approved response plus the
departments and dates to read from it.

`QueryBuilderService` in `central-backend` then:

1. Validates table and column names against `^[a-zA-Z_][a-zA-Z0-9_]*$` and dates against
   `^\d{4}-\d{2}-\d{2}$`.
2. Loads each `NodeAccessResponse`, confirming it belongs to the calling requestor, that it
   is `APPROVED`, and that it carries credentials.
3. Checks that the requested departments are a subset of the approved departments and that
   the requested dates fall inside the approved range, defaulting to the approved range
   when the requestor leaves them blank.
4. Emits one `SELECT` per hospital, joins them with `UNION ALL`, and appends a `LIMIT`.
5. Sends the finished statement to `POST /api/trino/query` on the proxy with the internal
   API key.

Each `SELECT` targets a schema of the form `iceberg."<namespace>::<access_key_id>"`.

### Why the access key is in the schema name

Trino talks to a REST catalog over a connection configured at startup. It has no way to
attach a per query header, so the proxy cannot be told through any normal channel which of
several outstanding grants a given query belongs to. The identity is therefore carried in
the one value the query itself controls: the schema name. `NamespaceSeparator` in
`central-proxy/internal/iceberg/catalog.go` is `::`, and the proxy splits the incoming
namespace back into a Nessie namespace and an access key ID.

This matters because two requestors can hold two different grants over the same hospital
namespace at the same time, with different departments and different date windows. Without
the access key in the identifier, the proxy could resolve the hospital but not the grant.
With it, the lookup is
`WHERE hospital_id = ? AND status = 'APPROVED' AND access_key_id = upper(?)`, and a key
that does not match an approved grant gets a `ForbiddenException` from the catalog.

### Serving the table

The proxy implements the Iceberg REST catalog itself rather than using the one built into
Nessie. On `LoadTable` it resolves the `ICEBERG_TABLE` entry through the Nessie Core API v2
(`/api/v2/trees/{ref}/entries`), fetches the table metadata JSON from the hospital's MinIO,
rewrites `s3a://` locations to `s3://`, and returns the metadata with a config block
carrying the grant's vended credentials and an S3 endpoint pointing back at the proxy's own
`/s3` path. Trino runs with `iceberg.rest-catalog.vended-credentials-enabled`, so it uses
those credentials for the object reads that follow.

There is a second implementation in `central-proxy/internal/proxy/metadata.go` that reverse
proxies Nessie's own catalog and injects the credentials into the response on the way
through, decompressing gzip when needed. The hand written catalog is the path the deployed
Trino configuration uses.

### The virtual S3 gateway

Trino's object reads arrive at the proxy as `/s3/{bucket}/iceberg/{namespace}/...`. The
proxy extracts the namespace, splits off the access key, resolves the hospital's MinIO
endpoint and the STS credentials for that grant, then presigns the request against the
hospital's MinIO with a fifteen minute expiry before forwarding it. Only `GET` and `HEAD`
are served.

Presigning rather than signing headers is deliberate. The deployment puts a Cloudflare
Tunnel between the proxy and the hospital, and an intermediary that adds or normalises
headers invalidates a SigV4 header signature. Moving the whole signature into the query
string makes the request survive header rewriting on the way. The proxy strips
`authorization`, `x-amz-*` and `host` from the inbound request before forwarding, so
nothing from Trino's own signing attempt leaks through.

Credential and hospital lookups are cached in process with TTLs (`CACHE_CREDENTIAL_TTL`,
`CACHE_HOSPITAL_TTL`), since one Trino query produces many object requests that would
otherwise each hit PostgreSQL.

## The ingestion path

See [etl-pipeline.md](etl-pipeline.md) for the stages, the FHIR shape, and how the job
runner is driven. In short: `node-backend` holds the schedule and the connection settings,
`etl-server` runs the Spark stages, and the final stage writes an Iceberg table into the
hospital's own MinIO through the Nessie catalog, partitioned so the approval path can scope
against it.

## Authentication summary

| Caller | Callee | Mechanism |
|--------|--------|-----------|
| Admin, hospital and requestor browsers | `central-backend` | Password login, httpOnly cookie holding a JWT |
| `node-backend` | `central-backend` | Client credentials grant, Bearer JWT, cached and refreshed before expiry |
| `central-backend` | `central-proxy` | `X-Internal-API-Key` shared secret |
| `node-backend` | `etl-server` | `X-Internal-API-Key` shared secret |
| Trino | `central-proxy` | None at the transport level. Authorisation is the access key encoded in the namespace |
| `central-proxy` | hospital MinIO | Presigned SigV4 using the grant's STS credentials |

Both internal API key middlewares allow all requests when the key is unset, which is
intended for local development only.
