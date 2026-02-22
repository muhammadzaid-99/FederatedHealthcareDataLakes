# Requestor API — Frontend Developer Reference

**Base URL:** `http://<host>/api/v1`

**Auth mechanism:** Cookie-based. After login, the server sets an `httpOnly` cookie called `requestor_token`. Every subsequent request automatically carries it. You do **not** read, store, or manually attach this cookie — the browser handles it.

> **Important:** Every `fetch` call must include `credentials: 'include'`  
> Every axios call must include `withCredentials: true`

---

## Typical User Flow

```
Register → Wait for admin approval → Login → Browse hospitals →
Create access request → Wait for hospital approval →
Use approved responses to run queries
```

---

## 1. Authentication

### Register
**`POST /requestors/register`** — public

Creates a new account. Status starts as `PENDING`. The account cannot log in until an admin approves it.

**Request body:**
```json
{
  "name": "Dr. Jane Smith",
  "email": "jane@university.edu",
  "password": "secret123",
  "organization": "City University"
}
```
`organization` is optional. `password` minimum 6 characters.

**Success `201`:**
```json
{
  "message": "Registration successful. Please wait for admin approval.",
  "requestor": {
    "id": "uuid",
    "name": "Dr. Jane Smith",
    "email": "jane@university.edu",
    "organization": "City University",
    "status": "PENDING"
  }
}
```

**Errors:**
- `400` — missing/invalid fields, or email already registered

---

### Login
**`POST /auth/requestor/login`** — public

Authenticates the user and sets the session cookie. Only accounts with status `APPROVED` can log in.

**Request body:**
```json
{
  "email": "jane@university.edu",
  "password": "secret123"
}
```

**Success `200`:**
```json
{
  "message": "Login successful",
  "requestor": {
    "id": "uuid",
    "name": "Dr. Jane Smith",
    "email": "jane@university.edu",
    "organization": "City University",
    "status": "APPROVED"
  }
}
```

**Errors:**
- `401` — wrong credentials, or account not yet approved

---

### Logout
**`POST /auth/requestor/logout`** — 🔒 requires login

Clears the session cookie.

**Success `200`:**
```json
{ "message": "Logged out successfully" }
```

---

## 2. Profile

### Get my profile
**`GET /requestor/me`** — 🔒 requires login

Returns the logged-in requestor's own details.

**Success `200`:**
```json
{
  "requestor": {
    "id": "uuid",
    "name": "Dr. Jane Smith",
    "email": "jane@university.edu",
    "organization": "City University",
    "status": "APPROVED",
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-01-20T12:00:00Z"
  }
}
```

---

## 3. Hospitals

### List active hospitals
**`GET /requestor/hospitals`** — 🔒 requires login

Returns all hospitals currently available for data access requests. Use this to populate the hospital selection list on the new request form.

**Success `200`:**
```json
{
  "hospitals": [
    {
      "id": "uuid",
      "name": "General Hospital",
      "admin_email": "admin@generalhospital.com",
      "status": "ACTIVE"
    }
  ]
}
```

---

## 4. Data Access Requests

A data access request is a formal ask to one or more hospitals: "I want access to these departments' data, for this purpose."

Each hospital responds independently — one request can have multiple per-hospital responses.

### Possible request statuses

| Status | Meaning |
|--------|---------|
| `PENDING` | Just created |
| `FORWARDED` | Sent to hospitals, waiting for responses |
| `APPROVED` | All hospitals approved |
| `PARTIAL_APPROVED` | Some hospitals approved, some rejected/pending |
| `REJECTED` | All hospitals rejected |
| `EXPIRED` | Past the expiry date |

### Possible per-hospital response statuses

| Status | Meaning |
|--------|---------|
| `PENDING` | Hospital has not responded yet |
| `APPROVED` | Hospital granted access — this response can be used for queries |
| `REJECTED` | Hospital denied access |

---

### Create a request
**`POST /requestor/requests`** — 🔒 requires login

**Request body:**
```json
{
  "requested_nodes": ["hospital-uuid-1", "hospital-uuid-2"],
  "departments": ["Cardiology", "Radiology"],
  "purpose": "Research study on cardiovascular disease patterns",
  "expires_in": 30
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `requested_nodes` | ✅ | Array of hospital UUIDs from `GET /requestor/hospitals`. Min 1. |
| `departments` | ✅ | Array of department names. Min 1. |
| `purpose` | ✅ | Free text description of why you need the data. |
| `expires_in` | ❌ | How many days the request stays valid. Defaults to `30`. |

**Success `201`:**
```json
{
  "message": "Access request created and forwarded to hospitals",
  "request": {
    "id": "uuid",
    "requestor_id": "uuid",
    "requested_nodes": ["hospital-uuid-1"],
    "departments": ["Cardiology"],
    "purpose": "Research study...",
    "status": "FORWARDED",
    "created_at": "2026-02-01T09:00:00Z",
    "expires_at": "2026-03-01T09:00:00Z"
  }
}
```

**Errors:**
- `400` — missing fields, or one of the hospital UUIDs is not valid/active

---

### List my requests
**`GET /requestor/requests`** — 🔒 requires login

Returns all requests belonging to the logged-in requestor. Includes the per-hospital response list in each request.

**Query params:**

| Param | Default | Notes |
|-------|---------|-------|
| `status` | (all) | Filter by request status, e.g. `?status=APPROVED` |
| `limit` | `20` | Max `100` |
| `offset` | `0` | For pagination |

**Success `200`:**
```json
{
  "requests": [
    {
      "id": "uuid",
      "requestor_id": "uuid",
      "requested_nodes": ["hospital-uuid-1"],
      "departments": ["Cardiology", "Radiology"],
      "purpose": "Research study...",
      "status": "PARTIAL_APPROVED",
      "created_at": "2026-02-01T09:00:00Z",
      "expires_at": "2026-03-01T09:00:00Z",
      "responses": [
        {
          "id": "response-uuid",
          "hospital_id": "hospital-uuid-1",
          "status": "APPROVED",
          "departments": ["Cardiology"],
          "date_range_start": "2024-01-01",
          "date_range_end": "2025-12-31",
          "valid_until": "2026-03-01T00:00:00Z",
          "hospital": {
            "id": "uuid",
            "name": "General Hospital"
          }
        }
      ]
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

---

### Get a single request
**`GET /requestor/requests/:id`** — 🔒 requires login

Same shape as one item from the list above. Returns `404` if the request doesn't belong to the logged-in user.

---

## 5. Querying Data

This is a two-step process:

**Step 1** — Call `GET /requestor/approved-access` to find which hospitals have approved you and what they approved (departments + date range). This populates your query form.

**Step 2** — Call `POST /requestor/query` with what you want to query. The server validates your access, builds the query safely, and runs it.

---

### Get approved access
**`GET /requestor/approved-access`** — 🔒 requires login

Returns every `APPROVED` hospital response across all of the requestor's requests. These are the only hospitals the requestor is allowed to query.

**Success `200`:**
```json
{
  "responses": [
    {
      "id": "response-uuid",
      "request_id": "request-uuid",
      "hospital_id": "hospital-uuid",
      "status": "APPROVED",
      "departments": ["Cardiology", "Radiology"],
      "date_range_start": "2024-01-01",
      "date_range_end": "2025-12-31",
      "valid_until": "2026-03-01T00:00:00Z",
      "hospital": {
        "id": "uuid",
        "name": "General Hospital"
      }
    }
  ]
}
```

> The `id` field of each response object is what you pass as `access_response_id` in the query call below.

---

### Execute a query
**`POST /requestor/query`** — 🔒 requires login

The server builds and executes the query. You never write SQL. You specify which approved responses to query, which departments, and an optional date range. The server enforces that you can only query what was approved for you.

**Request body:**
```json
{
  "table_name": "checkups",
  "columns": ["patient_id", "department_name", "checkup_date", "diagnosis"],
  "limit": 500,
  "selections": [
    {
      "access_response_id": "response-uuid-1",
      "departments": ["Cardiology"],
      "date_range_start": "2024-06-01",
      "date_range_end": "2024-12-31"
    },
    {
      "access_response_id": "response-uuid-2",
      "departments": ["Cardiology", "Radiology"],
      "date_range_start": "",
      "date_range_end": ""
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `table_name` | ✅ | e.g. `checkups`. Letters and underscores only. |
| `columns` | ❌ | Specific columns to fetch. Omit or send `[]` for all columns. |
| `limit` | ❌ | Max rows to return. Server caps at `1000`. Defaults to `1000`. |
| `selections` | ✅ | One entry per hospital you want data from. Min 1. |
| `selections[].access_response_id` | ✅ | The `id` from `GET /requestor/approved-access`. |
| `selections[].departments` | ✅ | Must be a subset of what was approved for that response. |
| `selections[].date_range_start` | ❌ | `YYYY-MM-DD`. Leave empty to use the hospital's approved range start. |
| `selections[].date_range_end` | ❌ | `YYYY-MM-DD`. Leave empty to use the hospital's approved range end. |

**Success `200`:**
```json
{
  "columns": ["patient_id", "department_name", "checkup_date", "diagnosis"],
  "rows": [
    ["P001", "Cardiology", "2024-07-15", "Hypertension"],
    ["P002", "Cardiology", "2024-09-03", "Arrhythmia"]
  ],
  "row_count": 2,
  "duration": "1.23s"
}
```

`rows` is a 2D array. Each inner array maps index-for-index to `columns`:
```
rows[0][0] → patient_id    = "P001"
rows[0][1] → department_name = "Cardiology"
rows[0][2] → checkup_date  = "2024-07-15"
rows[0][3] → diagnosis     = "Hypertension"
```

To convert to an array of objects for table rendering:
```ts
const records = result.rows.map(row =>
  Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
)
```

**Errors:**
- `400` — invalid table/column name, `access_response_id` not found or not yours, department not in approved set, date out of approved range

---

### Schema browsing (for autocomplete)

These three endpoints let you browse available tables and columns to help populate the query form. All return immediately.

#### List schemas
**`GET /requestor/schemas`** — 🔒 requires login
```json
{ "catalog": "iceberg", "schemas": ["hospital_ns1::keyA", "hospital_ns2::keyB"] }
```

#### List tables in a schema
**`GET /requestor/schemas/:schema/tables`** — 🔒 requires login
```json
{ "schema": "hospital_ns1::keyA", "tables": ["checkups"] }
```

#### List columns in a table
**`GET /requestor/schemas/:schema/tables/:table/columns`** — 🔒 requires login
```json
{
  "schema": "hospital_ns1::keyA",
  "table": "checkups",
  "columns": [
    { "Column": "patient_id", "Type": "varchar" },
    { "Column": "department_name", "Type": "varchar" },
    { "Column": "checkup_date", "Type": "date" },
    { "Column": "diagnosis", "Type": "varchar" }
  ]
}
```

---

## Error Response Shape

All errors follow the same shape:

```json
{ "error": "human readable message here" }
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Bad input — check `error` message |
| `401` | Not logged in, or account not approved |
| `403` | Logged in but not allowed to do this |
| `404` | Resource not found (or doesn't belong to you) |
| `500` | Server error |
