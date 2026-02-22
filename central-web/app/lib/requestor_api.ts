// Requestor API Client for central-web
// ALL requests go through central-backend (authenticated)
// The central-proxy is internal-only and never called from the browser.

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api/v1'

export interface Requestor {
  id: string
  name: string
  email: string
  organization: string
  status: string
  created_at: string
  updated_at: string
}

export interface Hospital {
  id: string
  name: string
  admin_email: string
  status: string
  created_at: string
}

export interface DataAccessRequest {
  id: string
  requestor_id: string
  requested_nodes: string[]
  departments: string[]
  purpose: string
  status: string
  requestor?: Requestor
  responses?: NodeAccessResponse[]
  created_at: string
  expires_at: string
  updated_at: string
}

export interface NodeAccessResponse {
  id: string
  request_id: string
  hospital_id: string
  status: string
  presigned_url?: string
  valid_until?: string
  responded_at?: string
  notes?: string
  // STS Credentials
  access_key_id?: string
  secret_access_key?: string
  session_token?: string
  cred_expiration?: string
  // Departments
  departments?: string[]
  // Date range
  date_range_start?: string
  date_range_end?: string
  // Policy
  policy_json?: string
  // Hospital info (joined)
  hospital?: Hospital
  created_at: string
  updated_at: string
}

export interface QueryResult {
  columns: string[]
  rows: any[][]
  row_count: number
  duration: string
  error?: string
}

export interface SchemaInfo {
  catalog: string
  schemas: string[]
}

export interface TableInfo {
  schema: string
  tables: string[]
}

export interface ColumnInfo {
  Column: string
  Type: string
  Extra?: string
  Comment?: string
}

// ---------------------------------------------------------------------------
// Structured Query Builder types
// ---------------------------------------------------------------------------

export interface HospitalSelection {
  access_response_id: string
  departments: string[]
  date_range_start?: string
  date_range_end?: string
}

export interface StructuredQueryPayload {
  selections: HospitalSelection[]
  table_name: string
  columns: string[]
  limit: number
}

// An approved NodeAccessResponse enriched with hospital info
export interface ApprovedAccess {
  id: string
  request_id: string
  hospital_id: string
  status: string
  access_key_id?: string
  departments?: string[]
  date_range_start?: string
  date_range_end?: string
  hospital?: Hospital
}

// Hardcoded departments for request form
// export const AVAILABLE_DEPARTMENTS = [
//   'Cardiology',
//   'Neurology',
//   'Oncology',
//   'Pediatrics',
//   'Emergency'
// ]

export const AVAILABLE_DEPARTMENTS = ['Cardiology', 'Gynecology', 'Neurology', 'Orthopedics', 'Pediatrics'];

class RequestorAPIClient {
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    }
  }

  // ============================================================
  // AUTH ENDPOINTS
  // ============================================================

  async register(name: string, email: string, password: string, organization: string): Promise<{ message: string; requestor: Requestor }> {
    const response = await fetch(`${API_BASE}/requestors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ name, email, password, organization }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Registration failed')
    }

    return response.json()
  }

  async login(email: string, password: string): Promise<{ message: string; requestor: Requestor }> {
    const response = await fetch(`${API_BASE}/auth/requestor/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Login failed')
    }

    return response.json()
  }

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/requestor/logout`, {
      method: 'POST',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      credentials: 'include',
    })
  }

  // ============================================================
  // REQUESTOR ENDPOINTS
  // ============================================================

  async getProfile(): Promise<{ requestor: Requestor }> {
    const response = await fetch(`${API_BASE}/requestor/me`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch profile')
    }

    return response.json()
  }

  async getMyRequests(params?: { status?: string; limit?: number; offset?: number }): Promise<{
    requests: DataAccessRequest[]
    total: number
    limit: number
    offset: number
  }> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())

    const url = `${API_BASE}/requestor/requests${searchParams.toString() ? '?' + searchParams.toString() : ''}`
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch requests')
    }

    return response.json()
  }

  async createRequest(data: {
    requested_nodes: string[]
    departments: string[]
    purpose: string
    expires_in?: number
  }): Promise<{ message: string; request: DataAccessRequest }> {
    const response = await fetch(`${API_BASE}/requestor/requests`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create request')
    }

    return response.json()
  }

  async getRequestById(requestId: string): Promise<DataAccessRequest> {
    const response = await fetch(`${API_BASE}/requestor/requests/${requestId}`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch request')
    }

    const data = await response.json()
    return data.request
  }

  async getActiveHospitals(): Promise<Hospital[]> {
    const response = await fetch(`${API_BASE}/requestor/hospitals`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch hospitals')
    }

    const data = await response.json()
    return data.hospitals || []
  }

  // ============================================================
  // QUERY ENDPOINTS (routed through central-backend, authenticated)
  // ============================================================

  /** Get all APPROVED access responses for the query builder form */
  async getApprovedAccess(): Promise<{ responses: ApprovedAccess[] }> {
    const response = await fetch(`${API_BASE}/requestor/approved-access`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch approved access')
    }
    return response.json()
  }

  /** Execute a structured query (server-side SQL building) */
  async executeStructuredQuery(payload: StructuredQueryPayload): Promise<QueryResult> {
    const response = await fetch(`${API_BASE}/requestor/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Query execution failed')
    }
    return response.json()
  }

  /** Legacy: execute a raw SQL query (kept for backwards compat but will be removed) */
  async executeQuery(query: string): Promise<QueryResult> {
    // Deprecated – raw queries are no longer supported from the browser.
    throw new Error('Raw queries are disabled. Use executeStructuredQuery instead.')
  }

  async getSchemas(): Promise<SchemaInfo> {
    const response = await fetch(`${API_BASE}/requestor/schemas`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error('Failed to fetch schemas')
    }
    return response.json()
  }

  async getTables(schema: string): Promise<TableInfo> {
    const response = await fetch(`${API_BASE}/requestor/schemas/${encodeURIComponent(schema)}/tables`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error('Failed to fetch tables')
    }
    return response.json()
  }

  async getColumns(schema: string, table: string): Promise<{ columns: ColumnInfo[] }> {
    const response = await fetch(
      `${API_BASE}/requestor/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`,
      {
        headers: this.getHeaders(),
        credentials: 'include',
      }
    )
    if (!response.ok) {
      throw new Error('Failed to fetch columns')
    }
    return response.json()
  }

  async clearCache(): Promise<void> {
    // Cache invalidation now requires internal API key – not callable from browser.
    // This is a no-op from the frontend.
    console.warn('clearCache is no longer available from the frontend')
  }
}

export const requestorApi = new RequestorAPIClient()
