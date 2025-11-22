# HMS-DLS2: Federated Hospital Data Lake System
## Central Control Plane + Hospital Node Portal

> A complete monorepo for federated hospital data sharing with central coordination and hospital node management.

[![Go Version](https://img.shields.io/badge/Go-1.23-blue.svg)](https://golang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📖 Complete Documentation

- **👉 [MONOREPO.md](MONOREPO.md)** - Monorepo structure, all 4 applications, development workflows
- **👉 [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - System architecture, APIs, data models
- **👉 [DEVELOPMENT_MODES.md](DEVELOPMENT_MODES.md)** - Docker vs local development

---

## 🏗️ Monorepo Structure

This project contains **4 applications**:

| Application | Type | Port | Description |
|------------|------|------|-------------|
| **central-backend** | Go API | 8080 | Central control plane API server |
| **central-web** | Next.js | 3000 | Admin portal for system administrators |
| **node-web** | Next.js | 3001 | Hospital node portal for data managers |
| **node-backend** | (Future) | TBD | Hospital local data processing |

```
hms-dls2/
├── central-backend/      # Central Control Plane Backend (Go)
├── central-web/         # Admin Portal Frontend (Next.js)
├── node-web/            # Hospital Node Portal Frontend (Next.js)
├── node-backend/        # Hospital Backend (Future)
└── docker-compose.yml   # Orchestrates all services
```

---

## ⚡ Quick Start (TL;DR)

### Start All Services
```bash
# Install frontend dependencies (first time only)
cd central-web/app && npm install && cd ../..
cd node-web && npm install && cd ..

# Start all Docker services
docker compose up -d

# Check services
docker compose ps

# View logs
docker compose logs -f
```

### Access Applications
- 🔹 **Central Backend API**: http://localhost:8080
- 🔹 **Central Admin Portal**: http://localhost:3000
- 🔹 **Hospital Node Portal**: http://localhost:3001
- 🔹 **RabbitMQ Management**: http://localhost:15672
- 🔹 **Nessie Catalog**: http://localhost:19120

### Test the System
```bash
# Automated end-to-end test
./test-e2e.sh

# Or manually test the flow:
# 1. Register hospital: http://localhost:3000/register
# 2. Admin approves: http://localhost:3000/login (admin/admin123)
# 3. Hospital handshake: http://localhost:3001/handshake (use issued credentials)
# 4. View requests: http://localhost:3001/requests
```

---

## 🎯 What Is This Project?

HMS-DLS2 is a **Federated Hospital Data Sharing System** with:

### Central Control Plane
- **Central Backend**: Coordinates the entire federation
- **Central Web**: Admin portal for approving hospitals and monitoring
- Manages hospital registrations, credentials, and data requests

### Hospital Nodes
- **Node Web**: Portal for hospital data managers
- **Node Backend** (future): Local data processing and storage
- Each hospital maintains its own data lake (MinIO + Iceberg)

### Key Workflow

1. **Hospital Registration** → Central admin approves → Issues credentials (client_id, client_secret)
2. **Node Handshake** → Hospital uses credentials to connect → Receives access token
3. **Data Request** → Researcher submits request → Routed to hospitals via RabbitMQ
4. **Hospital Response** → Reviews request in node-web → Approves/Rejects with presigned URL
5. **Data Access** → Researcher downloads from hospital's MinIO using presigned URL

---

## 🌟 Features

### ✅ Implemented

**Central Backend (Go):**
- 18 REST API endpoints
- Hospital registration & approval workflow
- Node handshake with credential validation
- Data request orchestration
- JWT authentication & authorization
- RabbitMQ queue provisioning
- Nessie catalog namespace management
- Comprehensive audit logging

**Central Web (Next.js):**
- Admin authentication
- Hospital approval/rejection interface
- View all hospitals and requests
- Pending registrations management
- Modern UI with shadcn/ui

**Node Web (Next.js):**
- **Handshake page** - Connect using client credentials
- **Dashboard** - View node status, capabilities, configuration
- **Requests page** - View incoming data requests, submit responses
- Token-based authentication
- Modern responsive UI

**DevOps:**
- Docker Compose for local development
- Automated test scripts
- Health check endpoints
- Production-ready containerization

### 🔮 Future Enhancements

- Hospital node implementation (separate project)
- Email notifications (approval, request status)
- Real-time dashboard updates (WebSockets)
- Enhanced query builder
- Audit trail UI

---

## 📋 Project Structure

```
hms-dls2/
├── cmd/server/              # Application entry point
├── internal/
│   ├── api/                 # REST API (routes, handlers, middleware)
│   ├── config/              # Configuration management
│   ├── database/            # PostgreSQL connection
│   ├── models/              # Database schemas
│   └── services/            # Business logic
├── web/
│   ├── admin/               # Legacy admin UI (backup)
│   └── app/                 # Modern Next.js frontend
│       ├── app/             # Pages (App Router)
│       ├── components/      # UI components (shadcn/ui)
│       └── lib/             # API client, utilities
├── docker-compose.yml       # Infrastructure services
├── Dockerfile               # Go backend container
├── test-hospital-portal.sh  # Automated tests
└── PROJECT_OVERVIEW.md      # 📖 COMPLETE DOCUMENTATION
```

---

## 🔗 Important Links

| Resource | URL | Description |
|----------|-----|-------------|
| **Frontend** | http://localhost:3000 | Modern admin + hospital portals |
| **Backend API** | http://localhost:8080 | REST API |
| **RabbitMQ** | http://localhost:15672 | Queue management (guest/guest) |
| **Nessie** | http://localhost:19120 | Iceberg catalog |
| **Health Check** | http://localhost:8080/health | Service status |

---

## 🖥️ Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| **Public Request Form** | `/request` | Submit data access requests |
| **Hospital Register** | `/register` | New hospital registration |
| **Hospital Login** | `/hospital/login` | Hospital authentication |
| **Hospital Dashboard** | `/hospital/dashboard` | View status & credentials |
| **Admin Login** | `/login` | Admin authentication |
| **Admin Dashboard** | `/dashboard` | Overview & stats |
| **Pending Approvals** | `/dashboard/pending` | Approve hospitals |
| **All Hospitals** | `/dashboard/hospitals` | View active hospitals |
| **Data Requests** | `/dashboard/requests` | Monitor requests |

---

## 🌐 API Endpoints (Quick Reference)

### Authentication
- `POST /api/v1/auth/admin/login` - Admin login
- `POST /api/v1/auth/hospital/login` - Hospital login
- `POST /api/v1/auth/token` - Client credentials

### Hospital Management
- `POST /api/v1/hospitals/register` - Register hospital
- `GET /api/v1/nodes/status` - Hospital dashboard data
- `GET /api/v1/admin/registrations` - Pending hospitals (admin)
- `PUT /api/v1/admin/registrations/:id/approve` - Approve hospital
- `GET /api/v1/admin/hospitals` - All hospitals (admin)

### Data Requests
- `POST /api/v1/requests` - Create request
- `GET /api/v1/requests` - List requests
- `GET /api/v1/requests/:id` - Request details
- `POST /api/v1/requests/:id/responses` - Submit response

**Full API documentation:** See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md#-api-endpoints)

---

## 🔐 Default Credentials

**Admin:**
- Username: `admin`
- Password: `admin123`

**⚠️ IMPORTANT:** Change these in production! See [Production Checklist](PROJECT_OVERVIEW.md#-production-readiness-checklist)

---

## 🧪 Testing

```bash
# Full hospital portal test (registration, login, approval)
./test-hospital-portal.sh

# End-to-end test
./test-e2e.sh

# Manual test flow
# 1. Register: http://localhost:3000/register
# 2. Admin login: http://localhost:3000/login
# 3. Approve: http://localhost:3000/dashboard/pending
# 4. Hospital login: http://localhost:3000/hospital/login
```

---

## 📦 Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Go 1.23, Gin, GORM, JWT |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| **Database** | PostgreSQL |
| **Message Broker** | RabbitMQ 3 |
| **Catalog** | Project Nessie (Apache Iceberg) |
| **Container** | Docker, Docker Compose |

---

## 🚀 Development Commands

```bash
# Backend
make build              # Build Go binary
make run                # Run binary
./bin/server            # Direct execution

# Docker
docker compose up -d    # Start all services
docker compose logs -f  # View logs
docker compose down     # Stop services

# Frontend
cd web/app
npm install             # Install dependencies
npm run dev             # Development server
npm run build           # Production build

# Testing
./test-hospital-portal.sh   # Hospital tests
./test-e2e.sh                # End-to-end tests
```

---

## 📚 Documentation Index

| Document | Description |
|----------|-------------|
| **PROJECT_OVERVIEW.md** | 📖 Complete comprehensive documentation (READ THIS!) |
| **README.md** | This file - Quick reference and getting started |
| **.trash/** | Archived development documentation |

---

## 🎯 Current Status

**Version:** v1.0 - Central Control Plane Complete ✅

**Implemented:**
- ✅ Complete backend API (18 endpoints)
- ✅ Complete frontend (10 pages)
- ✅ Hospital onboarding flow
- ✅ Data request creation and tracking
- ✅ Admin management portal
- ✅ Docker deployment
- ✅ Automated testing

**Next Phase:**
- Hospital node implementation (separate project)
- Data lake integration (MinIO + Iceberg)
- Query execution and response aggregation

---

## 🤝 Contributing

This is an FYP (Final Year Project) for the Hospital Management System course.

**Team:**
- Muhammad Zaid
- (Add other team members)

---

## 📝 License

[Add your license here]

---

## 📞 Need Help?

- **Full Documentation:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- **API Reference:** [PROJECT_OVERVIEW.md#-api-endpoints](PROJECT_OVERVIEW.md#-api-endpoints)
- **Architecture:** [PROJECT_OVERVIEW.md#-system-architecture](PROJECT_OVERVIEW.md#-system-architecture)
- **Testing Guide:** [PROJECT_OVERVIEW.md#-testing](PROJECT_OVERVIEW.md#-testing)

---

**Built with ❤️ for secure, federated healthcare data sharing**

**Last Updated:** November 22, 2025
│   ├── api/
│   │   ├── handlers/              # HTTP request handlers
│   │   │   ├── auth.go
│   │   │   ├── hospital.go
│   │   │   ├── request.go
│   │   │   └── health.go
│   │   ├── middleware/            # HTTP middleware
│   │   │   ├── auth.go
│   │   │   ├── cors.go
│   │   │   ├── logger.go
│   │   │   └── ratelimit.go
│   │   └── routes.go              # Route definitions
│   ├── models/
│   │   └── models.go              # Database models
│   ├── services/                  # Business logic
│   │   ├── auth.go
│   │   ├── hospital.go
│   │   ├── nessie.go
│   │   ├── rabbitmq.go
│   │   ├── request.go
│   │   └── audit.go
│   ├── database/
│   │   └── database.go            # Database initialization
│   └── config/
│       └── config.go              # Configuration management
├── web/
│   ├── app/                       # Next.js Frontend (Primary)
│   │   ├── app/                   # App Router pages
│   │   │   ├── login/            # Admin login
│   │   │   ├── dashboard/        # Admin dashboard
│   │   │   └── request/          # Public request portal
│   │   ├── components/ui/        # shadcn/ui components
│   │   ├── lib/                  # API client & utilities
│   │   └── package.json
│   └── admin/                     # Legacy Admin (Backup)
│       ├── index.html
│       └── admin.js
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

## 🔄 Hospital Registration Flow

### 1. Hospital Admin Signup
```bash
curl -X POST http://localhost:8080/api/v1/hospitals/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "City General Hospital",
    "email": "admin@cityhospital.com",
    "password": "SecurePass123!"
  }'
```

**Response**: Registration submitted with `PENDING_APPROVAL` status

### 2. Central Admin Approval

**Option 1: Next.js Admin Dashboard (Recommended)**
1. Open http://localhost:3000
2. Login with admin credentials (admin/admin123)
3. Navigate to "Pending Registrations"
4. Click **Approve** button
5. **IMPORTANT**: Copy and save the credentials (shown only once!)

**Option 2: Legacy Admin UI**
1. Login to Admin UI: http://localhost:8080/admin
2. View pending registrations
3. Click **Approve** button
4. **IMPORTANT**: Copy and save the credentials (shown only once!)

**Credentials provided**:
- `client_id`: UUID for authentication
- `client_secret`: Secure secret (never shown again)
- `nessie_namespace`: Isolated Iceberg namespace
- `queue_name`: Dedicated RabbitMQ queue

### 3. Node Handshake

Hospital node authenticates and exchanges configuration:

```bash
curl -X POST http://localhost:8080/api/v1/nodes/handshake \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "<CLIENT_ID>",
    "client_secret": "<CLIENT_SECRET>",
    "minio_endpoint": "http://minio:9000",
    "capabilities": {
      "max_data_size_gb": 100,
      "supported_formats": ["parquet", "avro"]
    },
    "metadata": {
      "location": "New York",
      "contact": "ops@hospital.com"
    }
  }'
```

**Response**: Access token + configuration (Nessie endpoint, queue name, etc.)

## 🔐 Authentication

### Admin Authentication

```bash
curl -X POST http://localhost:8080/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### Hospital Authentication

After handshake, use the JWT token for API calls:

```bash
curl -X GET http://localhost:8080/api/v1/nodes/status \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## 📊 Data Access Request Flow

### 1. Create Access Request

```bash
curl -X POST http://localhost:8080/api/v1/requests \
  -H "Content-Type: application/json" \
  -d '{
    "requestor_email": "researcher@university.edu",
    "requested_nodes": [
      "<HOSPITAL_ID_1>",
      "<HOSPITAL_ID_2>"
    ],
    "data_query": {
      "type": "patient_records",
      "conditions": ["diabetes", "hypertension"],
      "date_range": {
        "start": "2023-01-01",
        "end": "2023-12-31"
      }
    },
    "purpose": "Clinical research on comorbidity patterns",
    "expires_in": 30
  }'
```

**Flow**:
1. Request created with `PENDING` status
2. Automatically forwarded to each hospital's RabbitMQ queue
3. Status updates to `FORWARDED`

### 2. Hospital Responds (via API or queue)

```bash
curl -X POST http://localhost:8080/api/v1/requests/<REQUEST_ID>/responses \
  -H "Authorization: Bearer <HOSPITAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "APPROVED",
    "presigned_url": "https://minio.hospital.com/data/dataset.parquet?token=...",
    "valid_hours": 72,
    "notes": "Data anonymized according to HIPAA guidelines"
  }'
```

### 3. Check Request Status

```bash
curl -X GET http://localhost:8080/api/v1/requests/<REQUEST_ID>
```

**Possible statuses**:
- `PENDING`: Just created
- `FORWARDED`: Sent to hospitals
- `PARTIAL_APPROVED`: Some hospitals approved
- `APPROVED`: All hospitals approved
- `REJECTED`: All hospitals rejected

## 🔍 API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/hospitals/register` | Hospital registration |
| POST | `/api/v1/auth/admin/login` | Admin login |
| POST | `/api/v1/auth/token` | Get JWT token |
| POST | `/api/v1/nodes/handshake` | Node handshake |
| POST | `/api/v1/requests` | Create access request |
| GET | `/api/v1/requests/:id` | Get request status |
| GET | `/health` | Health check |

### Admin Endpoints (Requires JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/registrations` | List pending registrations |
| PUT | `/api/v1/admin/registrations/:id/approve` | Approve registration |
| PUT | `/api/v1/admin/registrations/:id/reject` | Reject registration |
| GET | `/api/v1/admin/hospitals` | List all hospitals |
| GET | `/api/v1/admin/hospitals/:id` | Get hospital details |

### Hospital Endpoints (Requires JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/nodes/status` | Get node status |
| POST | `/api/v1/requests/:id/responses` | Submit response to request |

## 🐰 RabbitMQ Integration

### Queue Architecture

- **Exchange**: `central.requests` (topic exchange)
- **Queue per Hospital**: `hospital.<HOSPITAL_ID>.requests`
- **Routing Key**: `request.<HOSPITAL_ID>`
- **Dead Letter Queue**: `central.dlq`

### Message Format

```json
{
  "request_id": "uuid",
  "requestor_id": "researcher@university.edu",
  "requestor_email": "researcher@university.edu",
  "data_query": { ... },
  "purpose": "Research purpose",
  "expires_at": "2024-01-31T23:59:59Z",
  "created_at": "2024-01-01T10:00:00Z"
}
```

Hospitals consume messages from their dedicated queue and respond via API.

## 🗄️ Database Schema

### Core Tables

- **hospitals**: Hospital node registrations and metadata
- **data_access_requests**: Data access requests
- **node_access_responses**: Hospital responses to requests
- **audit_logs**: Audit trail for all actions
- **admins**: Central admin users

See `internal/models/models.go` for complete schema.

## 🔒 Security Features

- ✅ bcrypt password hashing
- ✅ JWT-based authentication
- ✅ Client credentials flow (OAuth2-like)
- ✅ Rate limiting (100 req/min per IP)
- ✅ One-time credential display
- ✅ Comprehensive audit logging
- ✅ CORS support
- ✅ Namespace isolation (Nessie)
- ✅ Queue isolation (RabbitMQ)

## 🧪 Testing

### Manual Testing with curl

```bash
# 1. Register hospital
curl -X POST http://localhost:8080/api/v1/hospitals/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Hospital","email":"test@hospital.com","password":"pass123456"}'

# 2. Login as admin
curl -X POST http://localhost:8080/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 3. Get pending registrations (use token from step 2)
curl -X GET http://localhost:8080/api/v1/admin/registrations \
  -H "Authorization: Bearer <TOKEN>"

# 4. Approve hospital (get ID from step 3)
curl -X PUT http://localhost:8080/api/v1/admin/registrations/<HOSPITAL_ID>/approve \
  -H "Authorization: Bearer <TOKEN>"

# 5. Handshake (use credentials from step 4)
curl -X POST http://localhost:8080/api/v1/nodes/handshake \
  -H "Content-Type: application/json" \
  -d '{
    "client_id":"<CLIENT_ID>",
    "client_secret":"<CLIENT_SECRET>",
    "minio_endpoint":"http://localhost:9000"
  }'
```

### Health Check

```bash
curl http://localhost:8080/health
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f central-control

# Restart service
docker-compose restart central-control

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build central-control
```

## 📈 Monitoring

### RabbitMQ Management UI

Access at http://localhost:15672 (guest/guest)

- View queues and exchanges
- Monitor message rates
- Check consumer connections

### Application Logs

```bash
docker-compose logs -f central-control
```

Logs are structured (JSON format) and include:
- HTTP requests with duration
- Authentication events
- Queue operations
- Database queries
- Errors and warnings

## 🔧 Configuration

Edit `.env` file or set environment variables:

```bash
# Database
DB_HOST=postgres-central
DB_PORT=5432
DB_NAME=centraldb
DB_USER=central
DB_PASSWORD=centralpass

# RabbitMQ
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# Nessie
NESSIE_ENDPOINT=http://nessie:19120
NESSIE_DEFAULT_BRANCH=main

# Application
APP_PORT=8080
JWT_SECRET=change-me-in-production
JWT_EXPIRATION_HOURS=24
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## 🚧 Future Enhancements

These features are planned but not yet implemented:

- [ ] Public/private key signing for non-repudiation
- [ ] Apache Ranger integration for fine-grained access control
- [ ] Trino query execution from central plane
- [ ] Presigned URL management and lifecycle
- [ ] Multi-tenancy support
- [ ] GraphQL API alternative
- [ ] Webhook notifications for status changes
- [ ] Per-hospital rate limiting
- [ ] Metrics and monitoring (Prometheus/Grafana)
- [ ] TLS/SSL support
- [ ] Backup and disaster recovery
- [ ] High availability setup

## 📝 Development

### Local Development (without Docker)

```bash
# Install dependencies
go mod download

# Start dependencies only
docker-compose up -d postgres-central rabbitmq nessie

# Run application
go run cmd/server/main.go
```

### Build Binary

```bash
go build -o central-control ./cmd/server
./central-control
```

## 🤝 Contributing

This is a proof-of-concept system for hospital data federation. Contributions and suggestions are welcome!

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Troubleshooting

### Database connection fails

```bash
# Check PostgreSQL is running
docker-compose ps postgres-central

# View PostgreSQL logs
docker-compose logs postgres-central
```

### RabbitMQ connection fails

```bash
# Check RabbitMQ is running
docker-compose ps rabbitmq

# Access management UI
open http://localhost:15672
```

### Nessie unavailable

Nessie failures are non-critical. The system will log warnings but continue operation.

### Cannot access admin UI

Ensure static files are served:
```bash
# Check web directory exists
ls -la web/admin/

# Rebuild container
docker-compose up -d --build central-control
```

## 📞 Support

For issues and questions, please create an issue in the repository.
