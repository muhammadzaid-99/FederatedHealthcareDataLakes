# HMS-DLS2 Class Diagrams Documentation

## Overview
This document describes the data models for the Hospital Management System - Data Lake Solution (HMS-DLS2).
The system has two main components:
1. **Central Backend** - Central control plane that manages hospitals, users, and data access requests
2. **Node Backend** - Deployed at each hospital, handles ETL pipelines and local data management

---

## CENTRAL BACKEND MODELS

### 1. User
**Purpose:** Represents administrators and researchers who use the central platform.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| email | string | User's email address (unique) |
| password_hash | string | Bcrypt hashed password |
| name | string | User's full name |
| role | enum | "admin" or "researcher" |
| is_active | boolean | Account activation status |
| created_at | timestamp | Account creation time |
| updated_at | timestamp | Last update time |

**Relationships:**
- One User → Many DataAccessRequests (as requestor)

---

### 2. Hospital
**Purpose:** Represents a registered hospital node in the federation.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| name | string | Hospital name (unique) |
| email | string | Hospital admin email (unique) |
| password_hash | string | Bcrypt hashed password |
| address | string | Physical address |
| nessie_namespace | string | Assigned Nessie catalog namespace |
| minio_policy | string | Assigned MinIO policy name |
| is_active | boolean | Registration status |
| created_at | timestamp | Registration time |
| updated_at | timestamp | Last update time |

**Relationships:**
- One Hospital → Many NodeAccessResponses

---

### 3. DataAccessRequest
**Purpose:** Represents a researcher's request to access data from hospitals.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| requestor_id | UUID (FK) | Reference to User who made request |
| title | string | Request title/summary |
| purpose | string | Research purpose description |
| data_query | JSON | Query specification (tables, date range, etc.) |
| status | enum | "pending", "approved", "rejected", "partial" |
| target_hospital_ids | UUID[] | List of target hospital IDs |
| created_at | timestamp | Request submission time |
| updated_at | timestamp | Last update time |

**Relationships:**
- Many DataAccessRequests → One User (requestor)
- One DataAccessRequest → Many NodeAccessResponses

---

### 4. NodeAccessResponse
**Purpose:** Represents a hospital's response to a data access request (approval/rejection with credentials).

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| request_id | UUID (FK) | Reference to DataAccessRequest |
| hospital_id | UUID (FK) | Reference to responding Hospital |
| status | enum | "pending", "approved", "rejected" |
| access_key_id | string | STS temporary access key (nullable) |
| secret_access_key | string | STS temporary secret key (nullable) |
| session_token | text | STS session token (nullable) |
| cred_expiration | timestamp | Credential expiration time (nullable) |
| date_range_start | date | Approved data start date (nullable) |
| date_range_end | date | Approved data end date (nullable) |
| policy_json | text | IAM policy JSON (nullable) |
| minio_endpoint | string | MinIO server endpoint (nullable) |
| nessie_namespace | string | Nessie catalog namespace (nullable) |
| notes | string | Approval/rejection notes (nullable) |
| responded_at | timestamp | Response time (nullable) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Relationships:**
- Many NodeAccessResponses → One DataAccessRequest
- Many NodeAccessResponses → One Hospital

---

### 5. Message (Central)
**Purpose:** Tracks messages sent to hospital nodes via RabbitMQ.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| hospital_id | UUID (FK) | Target hospital |
| message_type | string | Type of message (e.g., "data_request") |
| payload | JSON | Message content |
| status | enum | "pending", "sent", "delivered", "failed" |
| sent_at | timestamp | Time message was sent |
| delivered_at | timestamp | Delivery confirmation time (nullable) |
| created_at | timestamp | Record creation time |

**Relationships:**
- Many Messages → One Hospital

---

## NODE BACKEND MODELS

### 6. NodeConfig
**Purpose:** Stores the hospital node's configuration received during handshake with central.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| hospital_id | UUID | Assigned hospital ID from central |
| hospital_name | string | Hospital name |
| nessie_namespace | string | Assigned Nessie catalog namespace |
| minio_policy | string | Assigned MinIO policy name |
| central_api_url | string | Central backend API URL |
| rabbitmq_queue | string | Assigned RabbitMQ queue name |
| is_registered | boolean | Registration completion status |
| created_at | timestamp | Configuration time |
| updated_at | timestamp | Last update time |

**Relationships:**
- One NodeConfig per node (singleton-like)

---

### 7. ETLConfig
**Purpose:** Stores ETL pipeline configuration for data extraction and transformation.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| name | string | Configuration name |
| description | string | Configuration description |
| db_host | string | Source database host |
| db_port | integer | Source database port |
| db_name | string | Source database name |
| db_user | string | Database username |
| db_password | string | Database password (encrypted) |
| db_table | string | Source table name |
| minio_endpoint | string | MinIO server endpoint |
| minio_access_key | string | MinIO access key |
| minio_secret_key | string | MinIO secret key (encrypted) |
| minio_bucket | string | Target MinIO bucket |
| python_executable | string | Python interpreter path |
| jdbc_driver_path | string | JDBC driver JAR path |
| schedule_enabled | boolean | Auto-run schedule enabled |
| schedule_interval | integer | Run interval in minutes |
| is_active | boolean | Configuration active status |
| last_run_at | timestamp | Last execution time (nullable) |
| last_run_status | string | Last run result (nullable) |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |

**Relationships:**
- One ETLConfig → Many ETLJobs

---

### 8. ETLJob
**Purpose:** Represents an individual ETL job execution.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| config_id | UUID (FK) | Reference to ETLConfig |
| status | enum | "pending", "running", "completed", "failed" |
| stage | string | Current stage (extraction, normalization, validation) |
| start_time | timestamp | Job start time |
| end_time | timestamp | Job completion time (nullable) |
| records_processed | integer | Number of records processed |
| records_failed | integer | Number of failed records |
| error_message | string | Error details if failed (nullable) |
| staging_path | string | Staging directory path (nullable) |
| normalized_path | string | Normalized data path (nullable) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Relationships:**
- Many ETLJobs → One ETLConfig

---

### 9. Message (Node)
**Purpose:** Stores messages received from central via RabbitMQ.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| message_id | string | Original message ID from central |
| message_type | string | Type (e.g., "data_request", "notification") |
| payload | JSON | Message content |
| status | enum | "received", "processing", "processed", "failed" |
| processed_at | timestamp | Processing completion time (nullable) |
| error_message | string | Error if processing failed (nullable) |
| created_at | timestamp | Receipt time |
| updated_at | timestamp | Last update time |

**Relationships:**
- One Message → One DataRequest (optional)

---

### 10. DataRequest
**Purpose:** Represents a data access request received from central, pending local approval.

| Attribute | Type | Description |
|-----------|------|-------------|
| id | UUID (PK) | Unique identifier |
| message_id | UUID (FK) | Reference to received Message |
| central_request_id | UUID | Original request ID from central |
| requestor_id | string | Researcher ID/email who made request |
| request_type | string | Type of request |
| status | enum | "pending", "approved", "rejected" |
| approved_at | timestamp | Approval time (nullable) |
| rejected_at | timestamp | Rejection time (nullable) |
| approved_by | string | Approver identifier (nullable) |
| rejected_by | string | Rejecter identifier (nullable) |
| date_range_start | date | Approved data start date (nullable) |
| date_range_end | date | Approved data end date (nullable) |
| policy_json | text | Generated IAM policy (nullable) |
| credentials_json | text | Generated STS credentials JSON (nullable) |
| request_payload | text | Original request details |
| notes | string | Approval/rejection notes (nullable) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Relationships:**
- Many DataRequests → One Message

---

## RELATIONSHIP DIAGRAM (Text Representation)

```
CENTRAL BACKEND:
================

┌─────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│    User     │1─────*│  DataAccessRequest  │1─────*│  NodeAccessResponse │
│             │       │                     │       │                     │
│ - id (PK)   │       │ - id (PK)           │       │ - id (PK)           │
│ - email     │       │ - requestor_id (FK) │       │ - request_id (FK)   │
│ - role      │       │ - title             │       │ - hospital_id (FK)  │
│ - name      │       │ - purpose           │       │ - status            │
└─────────────┘       │ - data_query        │       │ - credentials...    │
                      │ - status            │       └──────────┬──────────┘
                      └─────────────────────┘                  │
                                                               │*
┌─────────────┐                                                │
│  Hospital   │1───────────────────────────────────────────────┘
│             │
│ - id (PK)   │1─────*┌─────────────┐
│ - name      │       │   Message   │
│ - namespace │       │  (Central)  │
└─────────────┘       └─────────────┘


NODE BACKEND:
=============

┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│ NodeConfig  │       │  ETLConfig  │1─────*│     ETLJob      │
│  (Single)   │       │             │       │                 │
│             │       │ - id (PK)   │       │ - id (PK)       │
│ - id (PK)   │       │ - name      │       │ - config_id(FK) │
│ - namespace │       │ - db_*      │       │ - status        │
│ - hospital  │       │ - minio_*   │       │ - stage         │
└─────────────┘       └─────────────┘       └─────────────────┘


┌─────────────┐       ┌─────────────────┐
│   Message   │1─────1│   DataRequest   │
│   (Node)    │       │                 │
│             │       │ - id (PK)       │
│ - id (PK)   │       │ - message_id(FK)│
│ - type      │       │ - status        │
│ - payload   │       │ - credentials   │
└─────────────┘       └─────────────────┘


CROSS-SYSTEM COMMUNICATION:
===========================

Central Backend                          Node Backend
┌─────────────────────┐                 ┌─────────────────┐
│  DataAccessRequest  │───RabbitMQ────→│     Message     │
│                     │                 │    (Node)       │
└─────────────────────┘                 └────────┬────────┘
         ↑                                       │
         │                                       ↓
┌─────────────────────┐                 ┌─────────────────┐
│ NodeAccessResponse  │←───HTTP API────│   DataRequest   │
│                     │                 │                 │
└─────────────────────┘                 └─────────────────┘
```

---

## ENUMERATIONS

### User Roles (Central)
- `admin` - Full system access
- `researcher` - Can create data access requests

### Request Status
- `pending` - Awaiting response
- `approved` - Access granted
- `rejected` - Access denied
- `partial` - Some hospitals approved, some rejected

### ETL Job Status
- `pending` - Queued for execution
- `running` - Currently executing
- `completed` - Successfully finished
- `failed` - Execution failed

### ETL Stages
- `extraction` - Pulling data from source database
- `normalization` - Converting to FHIR format
- `validation` - Validating and publishing to Iceberg

### Message Status (Node)
- `received` - Message received from RabbitMQ
- `processing` - Currently being processed
- `processed` - Successfully handled
- `failed` - Processing failed

---

## NOTES FOR DIAGRAM DRAWING

1. **Primary Keys (PK)** - All entities use UUID as primary key
2. **Foreign Keys (FK)** - Shown with references to parent entity
3. **Cardinality Notation:**
   - `1` = One (exactly one)
   - `*` = Many (zero or more)
   - `1─────*` = One-to-Many relationship
   - `1─────1` = One-to-One relationship

4. **Color Suggestions:**
   - Central Backend entities: Blue
   - Node Backend entities: Green
   - Cross-system communication: Orange/Yellow arrows

5. **Grouping:**
   - Group User + Hospital as "Identity" module
   - Group DataAccessRequest + NodeAccessResponse as "Access Control" module
   - Group ETLConfig + ETLJob as "ETL Pipeline" module
   - Group Message + DataRequest (Node) as "Request Processing" module
