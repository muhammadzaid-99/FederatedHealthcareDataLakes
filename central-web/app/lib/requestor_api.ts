// Requestor API Client for central-web
// Separate from admin/hospital APIs for separation of concerns

const API_BASE = 'http://localhost:8080/api/v1'
const PROXY_API = 'http://localhost:8081'

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
    }
  }

  // ============================================================
  // AUTH ENDPOINTS
  // ============================================================

  async register(name: string, email: string, password: string, organization: string): Promise<{ message: string; requestor: Requestor }> {
    const response = await fetch(`${API_BASE}/requestors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
  // PROXY / QUERY ENDPOINTS
  // ============================================================

  async executeQuery(query: string): Promise<QueryResult> {
    const response = await fetch(`${PROXY_API}/api/trino/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim() }),
    })

    return response.json()
  }

  async getSchemas(): Promise<SchemaInfo> {
    const response = await fetch(`${PROXY_API}/api/trino/schemas`)
    if (!response.ok) {
      throw new Error('Failed to fetch schemas')
    }
    return response.json()
  }

  async getTables(schema: string): Promise<TableInfo> {
    const response = await fetch(`${PROXY_API}/api/trino/schemas/${encodeURIComponent(schema)}/tables`)
    if (!response.ok) {
      throw new Error('Failed to fetch tables')
    }
    return response.json()
  }

  async getColumns(schema: string, table: string): Promise<{ columns: ColumnInfo[] }> {
    const response = await fetch(
      `${PROXY_API}/api/trino/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`
    )
    if (!response.ok) {
      throw new Error('Failed to fetch columns')
    }
    return response.json()
  }

  async clearCache(): Promise<void> {
    await fetch(`${PROXY_API}/admin/cache/invalidate`, { method: 'POST' })
  }
}

export const requestorApi = new RequestorAPIClient()
