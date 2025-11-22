# HMS-DLS2: Complete System Architecture & Business Logic

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Components](#architecture-components)
3. [Data Flow & Communication](#data-flow--communication)
4. [Authentication & Security](#authentication--security)
5. [Database Architecture](#database-architecture)
6. [RabbitMQ Integration](#rabbitmq-integration)
7. [Current Implementation Status](#current-implementation-status)
8. [Key Technical Decisions](#key-technical-decisions)

---

## System Overview

### Purpose
HMS-DLS2 is a **Federated Hospital Data Lake System** that enables:
- **Central administrators** to manage multiple hospital nodes
- **Hospital operators** to share data securely while maintaining local control
- **Researchers** to request and access aggregated healthcare data
- **Decentralized data storage** with centralized coordination

### Architecture Pattern
**Hub-and-Spoke Model** where:
- **Hub (Central)**: Coordinates hospitals, manages requests, distributes tasks
- **Spokes (Nodes)**: Individual hospitals that maintain their own data and control access

---

## Architecture Components

### 1. Central Backend (Port 8080)
**Technology**: Go + Gin + PostgreSQL + RabbitMQ

**Responsibilities**:
- **Hospital Management**: Register, authenticate, and track hospital nodes
- **User Management**: Admin users, researchers, and their permissions
- **Access Request Workflow**: Researchers submit requests, admins approve/reject
- **Credential Generation**: Creates OAuth2-style credentials for hospitals (client_id/client_secret)
- **Message Distribution**: Sends data requests to hospitals via RabbitMQ
- **Token Management**: Issues JWT tokens for hospital authentication
- **Audit Logging**: Tracks all system activities

**Database**: `central_db` (PostgreSQL, port 5432)
- `hospitals` - Hospital registrations with credentials
- `users` - System users (admins, researchers)
- `access_requests` - Data access requests from researchers
- `audit_logs` - Activity tracking

**Key Endpoints**:
- `POST /api/v1/auth/login` - Admin/researcher login
- `POST /api/v1/hospitals/register` - Register new hospital
- `POST /api/v1/hospitals/generate-credentials` - Generate client credentials
- `POST /api/v1/hospitals/:id/handshake` - Hospital authentication handshake
- `POST /api/v1/requests` - Create data access request
- `GET /api/v1/nodes/me` - Hospital node info (authenticated with client credentials)

**RabbitMQ Queues**:
- Creates dedicated queue per hospital: `hospital.{client_id}.requests`
- Publishes data access requests to hospital-specific queues

---

### 2. Central Web (Port 3000)
**Technology**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui

**Responsibilities**:
- **Admin Dashboard**: System overview, hospital management
- **Hospital Registration**: Onboard new hospitals and generate credentials
- **Request Management**: View, approve/reject data access requests
- **Researcher Portal**: Submit and track data requests
- **Credential Display**: Show generated client_id/client_secret to admins

**User Roles**:
- **Admin**: Full system access, hospital management
- **Researcher**: Submit data requests, view approved requests

**Key Pages**:
- `/login` - Authentication
- `/dashboard` - Overview and quick actions
- `/hospitals` - List all registered hospitals
- `/hospitals/register` - Register new hospital + generate credentials
- `/pending` - Pending hospital registrations
- `/requests` - Data access request management

**Authentication**: 
- Uses JWT tokens from central-backend
- Stores token in localStorage as `access_token`
- All API calls include `Authorization: Bearer <token>` header

---

### 3. Node Backend (Port 9090)
**Technology**: Go + Gin + PostgreSQL + RabbitMQ + GORM

**Responsibilities**:
- **Hospital User Management**: Local authentication for hospital operators
- **Credential Storage**: Securely stores client_id/client_secret from central
- **Handshake Orchestration**: Authenticates with central-backend using credentials
- **RabbitMQ Consumer**: Listens to hospital-specific queue for incoming requests
- **Message Storage**: Persists received RabbitMQ messages in local database
- **Data Access Control**: Future - generates secure URLs for approved data access
- **Middleware Layer**: Prevents exposing hospital credentials to browser

**Database**: `node_db` (PostgreSQL, port 5434)
- `users` - Hospital operators (username, email, password)
- `node_configs` - Stored credentials and configuration
- `messages` - RabbitMQ messages from central

**Key Endpoints**:
- `POST /api/v1/auth/login` - Hospital operator login
- `POST /api/v1/auth/register` - Register hospital operator
- `POST /api/v1/config` - Save central credentials (client_id, client_secret, queue_name)
- `POST /api/v1/handshake` - Authenticate with central and start RabbitMQ listener
- `GET /api/v1/node/status` - Get current configuration status
- `GET /api/v1/messages` - Retrieve stored RabbitMQ messages

**Critical Features**:
- **Credentials Never Exposed**: Client credentials stay on server, never sent to browser
- **Automatic Reconnection**: On server restart, checks if configured and auto-starts RabbitMQ listener
- **Goroutine Protection**: Uses mutex to prevent multiple RabbitMQ listeners
- **Silent Database Logging**: GORM set to silent mode to reduce verbose output

---

### 4. Node Web (Port 3001)
**Technology**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui

**Responsibilities**:
- **Operator Authentication**: Login/register for hospital staff
- **Configuration UI**: Two-step process to connect to central
  1. Save credentials (client_id, client_secret, queue, namespace)
  2. Initiate handshake with central-backend
- **Queue Viewer**: Display incoming RabbitMQ messages (data requests)
- **Request Handler**: Future - approve/reject requests, generate data URLs
- **Dashboard**: Show connection status and configuration

**Key Pages**:
- `/login` - Hospital operator login
- `/register` - New operator registration
- `/dashboard` - Node status and quick actions
- `/handshake` - Two-step configuration process
- `/queue-viewer` - View incoming messages from RabbitMQ
- `/requests` - Handle data access requests (placeholder)

**Authentication**:
- Uses JWT tokens from node-backend
- Stores token in localStorage as `node_web_token`
- All requests go through node-backend (localhost:9090)
- **Security**: Never handles client credentials directly

---

## Data Flow & Communication

### Hospital Registration Flow
```
1. Admin (central-web) → POST /api/v1/hospitals/register → central-backend
2. central-backend creates hospital record, generates:
   - client_id (UUID)
   - client_secret (bcrypt hashed)
   - queue_name (hospital.{client_id}.requests)
   - nessie_namespace (hospital_{short_id})
3. central-backend creates dedicated RabbitMQ queue
4. Admin receives credentials and shares with hospital
```

### Hospital Configuration Flow (Two-Step Process)
```
Step 1: Save Configuration
1. Hospital operator (node-web) enters credentials from admin
2. node-web → POST /api/v1/config → node-backend
3. node-backend stores in node_configs table (encrypted client_secret)

Step 2: Handshake
1. Operator clicks "Initiate Handshake"
2. node-web → POST /api/v1/handshake → node-backend
3. node-backend → POST /api/v1/hospitals/{id}/handshake → central-backend
   (with client_id + client_secret)
4. central-backend validates credentials, issues JWT access_token
5. node-backend stores access_token
6. node-backend connects to RabbitMQ
7. node-backend starts listening on hospital-specific queue
```

### Data Request Flow
```
1. Researcher (central-web) → POST /api/v1/requests → central-backend
   - Specifies: purpose, hospitals[], data_types[], time_range
2. central-backend creates access_request record (status: pending)
3. Admin (central-web) reviews and approves request
4. central-backend → publishes message to RabbitMQ queue for each hospital
   - Queue: hospital.{client_id}.requests
   - Message: {type: "data_request", request_id, purpose, data_types, ...}
5. node-backend RabbitMQ consumer receives message
6. node-backend stores message in messages table
7. Hospital operator (node-web) views message in queue-viewer
8. [FUTURE] Operator approves/rejects in node-web
9. [FUTURE] node-backend generates secure data access URL
10. [FUTURE] Researcher accesses data via URL
```

### RabbitMQ Message Flow
```
Central Backend                     RabbitMQ                    Node Backend
     │                                 │                            │
     │── Publish message ──────────────>│                            │
     │   (hospital.{id}.requests)       │                            │
     │                                  │                            │
     │                                  │<────── Subscribe ──────────│
     │                                  │   (on handshake/startup)   │
     │                                  │                            │
     │                                  │──── Deliver message ───────>│
     │                                  │                            │
     │                                  │<────── Ack/Nack ───────────│
     │                                  │                            │
```

---

## Authentication & Security

### Three Separate Authentication Systems

#### 1. Central System Auth (central-backend + central-web)
- **Users**: Admins, researchers
- **Method**: Username + password → JWT token
- **Token Storage**: localStorage (`access_token`)
- **Token Lifetime**: 24 hours
- **Issued by**: central-backend `/api/v1/auth/login`

#### 2. Hospital Node Auth (node-backend + node-web)
- **Users**: Hospital operators
- **Method**: Username + password → JWT token
- **Token Storage**: localStorage (`node_web_token`)
- **Token Lifetime**: 24 hours
- **Issued by**: node-backend `/api/v1/auth/login`
- **Independent**: Completely separate from central auth

#### 3. Hospital-to-Central Auth (OAuth2-style)
- **Purpose**: Authenticate hospital node to central backend
- **Credentials**: client_id + client_secret (generated by central)
- **Method**: Client credentials grant
- **Token**: Access token returned after handshake
- **Storage**: node-backend stores in `node_configs.access_token`
- **Usage**: node-backend uses to call central-backend API
- **Critical**: These credentials NEVER reach the browser

### Security Architecture

```
Browser (node-web)           Node Backend              Central Backend
      │                           │                          │
      │── Login (user/pass) ──────>│                          │
      │<── JWT token (24h) ────────│                          │
      │                           │                          │
      │── Save Config ────────────>│                          │
      │   (client_id/secret)       │                          │
      │                           │─ Store credentials ──────│
      │                           │   (encrypted)            │
      │                           │                          │
      │── Handshake ──────────────>│                          │
      │                           │── POST /handshake ───────>│
      │                           │   (client credentials)   │
      │                           │<── Access Token ─────────│
      │<── Success ───────────────│                          │
      │                           │                          │
      │── Get Messages ───────────>│                          │
      │   (JWT token)              │                          │
      │<── Messages ──────────────│                          │
```

**Key Security Measures**:
1. Client credentials stored server-side only
2. Separate JWT secrets for central and node systems
3. bcrypt password hashing (cost 10)
4. CORS configured for specific origins
5. Database credentials in environment variables
6. Silent database logging (no query leakage)

---

## Database Architecture

### Central Database (`central_db` - Port 5432)

**hospitals** table:
```go
id              UUID (primary key)
name            string (required)
location        string
contact_email   string
contact_phone   string
client_id       string (unique, UUID) // OAuth2 client identifier
client_secret   string (bcrypt hashed) // OAuth2 client secret
queue_name      string // RabbitMQ queue name
nessie_namespace string // Nessie lakehouse namespace
access_token    string // Current JWT token (if handshake done)
status          string (pending/active/inactive)
is_approved     boolean
approved_by     UUID (foreign key → users)
approved_at     timestamp
created_at      timestamp
updated_at      timestamp
```

**users** table:
```go
id         UUID
username   string (unique)
email      string (unique)
password   string (bcrypt hashed)
role       string (admin/researcher)
created_at timestamp
updated_at timestamp
```

**access_requests** table:
```go
id                  UUID
researcher_id       UUID (foreign key → users)
purpose             text
requested_hospitals UUID[] (array of hospital IDs)
data_types          string[] (array)
start_date          date
end_date            date
status              string (pending/approved/rejected)
approved_by         UUID (foreign key → users)
approved_at         timestamp
created_at          timestamp
```

### Node Database (`node_db` - Port 5434)

**users** table:
```go
id         UUID
username   string (unique)
email      string (unique)
password   string (bcrypt hashed)
role       string (operator/admin)
created_at timestamp
updated_at timestamp
```

**node_configs** table:
```go
id                UUID
client_id         string // From central
client_secret     string // From central (encrypted)
queue_name        string // RabbitMQ queue to listen
nessie_namespace  string // Data lakehouse namespace
access_token      string // JWT from central after handshake
token_expires_at  timestamp
created_at        timestamp
updated_at        timestamp
```

**messages** table:
```go
id            UUID
queue_name    string // Source queue
message_type  string (data_request/notification)
payload       text (JSON string)
status        string (pending/processed/failed)
processed_at  timestamp
created_at    timestamp
updated_at    timestamp
```

---

## RabbitMQ Integration

### Queue Naming Convention
```
hospital.{client_id}.requests
Example: hospital.92d766e0-3299-41de-a4e5-9bda2573f301.requests
```

### Queue Configuration
- **Durable**: true (survives broker restart)
- **Auto-delete**: false
- **Exclusive**: false
- **Arguments**: `x-message-ttl: 604800000` (7 days in milliseconds)

### Message Format
```json
{
  "type": "data_request",
  "request_id": "uuid",
  "researcher_id": "uuid",
  "purpose": "Cancer research study",
  "data_types": ["patient_demographics", "lab_results"],
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "timestamp": "2025-11-22T20:00:00Z"
}
```

### Consumer Implementation (node-backend)

**Startup Behavior**:
```go
1. Server starts
2. After 2 seconds (DB initialization)
3. Check if node_configs exists and has access_token
4. If yes:
   - Connect to RabbitMQ
   - Start listening on queue_name
   - Log: "Successfully started RabbitMQ listener"
5. If no:
   - Log: "Node not configured yet"
```

**Handshake Behavior**:
```go
1. Receive handshake request from node-web
2. Authenticate with central-backend
3. Store access_token
4. Connect to RabbitMQ (if not connected)
5. Start listening (with mutex protection)
```

**Goroutine Protection**:
```go
type RabbitMQService struct {
    isListening bool
    mu          sync.Mutex
}

func (s *RabbitMQService) StartListening(queue string) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    if s.isListening {
        return nil // Already listening
    }
    
    // Start consumer...
    s.isListening = true
}
```

**Message Processing**:
1. Receive message from channel
2. Parse JSON payload
3. Store in `messages` table (status: pending)
4. Process based on type (data_request, notification, etc.)
5. Update status (processed/failed)
6. Acknowledge message to RabbitMQ

---

## Current Implementation Status

### ✅ Completed Features

#### Central System
- [x] Hospital registration and credential generation
- [x] OAuth2-style client credential system
- [x] RabbitMQ queue creation per hospital
- [x] Handshake endpoint for hospital authentication
- [x] Admin and researcher authentication
- [x] Access request creation
- [x] Audit logging

#### Node System
- [x] Hospital operator authentication (separate from central)
- [x] Two-step configuration UI (save + handshake)
- [x] Credential storage (server-side only)
- [x] Handshake with central backend
- [x] RabbitMQ consumer implementation
- [x] Message persistence in database
- [x] Automatic listener on server startup
- [x] Goroutine protection with mutex
- [x] Dashboard showing configuration status
- [x] Queue viewer displaying messages
- [x] Reconfiguration/re-handshake capability

#### Web Interfaces
- [x] central-web: Hospital registration with credential display
- [x] central-web: Dashboard and navigation
- [x] node-web: Login and registration pages
- [x] node-web: Handshake page (two-step process)
- [x] node-web: Dashboard with status
- [x] node-web: Queue viewer
- [x] node-web: All pages use node-backend API (never direct to central)

### 🚧 In Progress / Known Issues
- [ ] Messages visible in RabbitMQ but not showing in node-web UI
- [ ] Queue declaration parameter mismatch (x-message-ttl)
- [ ] Need to verify end-to-end message flow

### 📋 Future Features (Not Yet Implemented)
- [ ] Data request approval/rejection in node-web
- [ ] Secure data access URL generation
- [ ] Actual data extraction from hospital systems
- [ ] Researcher data access interface
- [ ] Request status tracking
- [ ] Nessie lakehouse integration
- [ ] Data anonymization/de-identification
- [ ] Audit trail visualization

---

## Key Technical Decisions

### 1. Why Separate Node Backend?
**Reason**: Security and credential isolation

Without node-backend:
```
node-web → central-backend (with client credentials in browser) ❌
```

With node-backend:
```
node-web → node-backend → central-backend ✅
(JWT only)  (stores credentials)
```

### 2. Why Two-Step Handshake?
**Reason**: Separate configuration from connection

- **Step 1**: Save credentials (can be done offline)
- **Step 2**: Test credentials and establish connection
- Allows reconfiguration without re-entering everything

### 3. Why Separate Databases?
**Reason**: Data sovereignty and isolation

- Central: Manages coordination data
- Node: Manages local hospital data
- Hospitals maintain control over their data
- No direct central access to hospital records

### 4. Why RabbitMQ Instead of Direct API?
**Reason**: Asynchronous, reliable message delivery

- Hospitals may be offline temporarily
- Messages persist in queue until consumed
- Decouples central from node availability
- Supports future pub/sub patterns

### 5. Why Mutex for RabbitMQ Listener?
**Reason**: Prevent duplicate goroutines

Scenario without mutex:
```
1. Server starts → StartListening() → goroutine 1
2. User clicks handshake → StartListening() → goroutine 2
Result: Two goroutines processing same messages ❌
```

With mutex:
```
1. Server starts → StartListening() → sets isListening=true
2. User clicks handshake → StartListening() → sees isListening=true → returns early ✅
```

### 6. Why Silent Database Logging?
**Reason**: Reduce noise in development

GORM logs every schema inspection query on startup (hundreds of lines).
Silent mode keeps logs clean while retaining error reporting.

---

## Development Workflow

### Starting the System

1. **Prerequisites**:
   ```bash
   - PostgreSQL running (ports 5432, 5434)
   - RabbitMQ running (port 5672)
   - Go 1.23+
   - Node.js 18+
   ```

2. **Start Central Backend**:
   ```bash
   cd central-backend
   go run ./cmd/server
   # Listens on :8080
   ```

3. **Start Central Web**:
   ```bash
   cd central-web/app
   npm install
   npm run dev
   # Listens on :3000
   ```

4. **Start Node Backend**:
   ```bash
   cd node-backend
   go build -o server ./cmd/server
   ./server
   # Listens on :9090
   ```

5. **Start Node Web**:
   ```bash
   cd node-web
   npm install
   npm run dev
   # Listens on :3001
   ```

### Testing Complete Flow

1. **Register Hospital** (as admin on central-web:3000):
   - Login as admin
   - Go to "Register Hospital"
   - Fill form and submit
   - Copy client_id, client_secret, queue_name

2. **Configure Node** (as operator on node-web:3001):
   - Register new operator account
   - Login
   - Go to "Configuration" or "Handshake"
   - Step 1: Enter credentials from admin
   - Step 2: Click "Initiate Handshake"
   - Verify "Connected" status

3. **Create Data Request** (as researcher on central-web:3000):
   - Login as researcher
   - Go to "Requests" → "New Request"
   - Select hospitals, data types, date range
   - Submit request

4. **View Messages** (as operator on node-web:3001):
   - Go to "Queue Viewer"
   - See incoming data request messages
   - [Future] Approve/reject requests

---

## Environment Variables

### Central Backend
```bash
CENTRAL_PORT=8080
CENTRAL_DB_HOST=localhost
CENTRAL_DB_PORT=5432
CENTRAL_DB_USER=central_user
CENTRAL_DB_PASSWORD=central_password
CENTRAL_DB_NAME=central_db
JWT_SECRET=your-secret-key
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
```

### Node Backend
```bash
NODE_PORT=9090
NODE_DB_HOST=localhost
NODE_DB_PORT=5434
NODE_DB_USER=node_user
NODE_DB_PASSWORD=node_password
NODE_DB_NAME=node_db
NODE_JWT_SECRET=node-jwt-secret
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
CENTRAL_BACKEND_URL=http://localhost:8080
```

### Frontend (Next.js)
```bash
# central-web
NEXT_PUBLIC_API_URL=http://localhost:8080

# node-web
NEXT_PUBLIC_API_URL=http://localhost:9090
```

---

## Port Summary

| Service | Port | Protocol |
|---------|------|----------|
| Central Backend | 8080 | HTTP |
| Central Web | 3000 | HTTP |
| Node Web | 3001 | HTTP |
| Node Backend | 9090 | HTTP |
| Central PostgreSQL | 5432 | PostgreSQL |
| Node PostgreSQL | 5434 | PostgreSQL |
| RabbitMQ | 5672 | AMQP |
| RabbitMQ Management | 15672 | HTTP |

---

## Troubleshooting Guide

### Issue: "node not configured yet" error on dashboard
**Solution**: This is expected when node hasn't been configured. Go to /handshake to configure.

### Issue: RabbitMQ queue parameter mismatch
**Error**: `PRECONDITION_FAILED - inequivalent arg 'x-message-ttl'`
**Solution**: Use `QueueDeclarePassive()` instead of `QueueDeclare()` to avoid parameter conflicts.

### Issue: Multiple RabbitMQ goroutines
**Solution**: Implemented mutex with `isListening` flag to prevent duplicates.

### Issue: Verbose database logs
**Solution**: Set GORM logger to `Silent` mode in database initialization.

### Issue: Messages in RabbitMQ but not visible in UI
**Check**:
1. Is RabbitMQ listener running? Check node-backend logs
2. Are messages in correct queue? Check RabbitMQ management UI
3. Are messages being persisted? Check `messages` table in node_db
4. Is API endpoint working? Test GET /api/v1/messages directly

---

## Glossary

- **Central Control Plane**: The hub system that coordinates all hospitals
- **Hospital Node**: Individual hospital installation (node-backend + node-web)
- **Client Credentials**: OAuth2-style client_id/client_secret for hospital authentication
- **Handshake**: Authentication process where hospital proves identity to central
- **Access Token**: JWT token issued after successful handshake
- **Queue Name**: RabbitMQ queue dedicated to a specific hospital
- **Nessie Namespace**: Logical partition in data lakehouse for hospital data
- **Access Request**: Researcher request to access aggregated data from hospitals
- **Operator**: Hospital staff member who manages node configuration

---

**Last Updated**: November 22, 2025
**Status**: Active Development - Core infrastructure complete, testing message flow
