// Use backend URL directly since Next.js rewrites don't work in dev mode
const API_BASE = process.env.API_BASE || 'http://localhost:8080/api/v1'

export interface LoginResponse {
  token: string
}

export interface Hospital {
  id: string
  name: string
  email: string
  status: string
  client_id?: string
  client_secret?: string
  nessie_namespace?: string
  queue_name?: string
  minio_endpoint?: string
  created_at: string
  updated_at: string
}

export interface DataAccessRequest {
  id: string
  requestor_id: string
  requestor_email: string
  requested_nodes: string[]  // array of hospital IDs
  data_query: any  // JSONB object
  purpose: string
  status: string
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

class APIClient {
  // For central-web, we use cookies - no need to get token from localStorage
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    }
  }

  async adminLogin(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Login failed')
    }

    return response.json()
  }

  async getPendingRegistrations(): Promise<Hospital[]> {
    const response = await fetch(`${API_BASE}/admin/registrations`, {
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies
    })

    if (!response.ok) {
      throw new Error('Failed to fetch pending registrations')
    }

    const data = await response.json()
    return data.registrations || []
  }

  async getAllHospitals(): Promise<Hospital[]> {
    const response = await fetch(`${API_BASE}/admin/hospitals`, {
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies
    })

    if (!response.ok) {
      throw new Error('Failed to fetch hospitals')
    }

    const data = await response.json()
    return data.hospitals || []
  }

  async approveHospital(hospitalId: string): Promise<Hospital> {
    const response = await fetch(`${API_BASE}/admin/registrations/${hospitalId}/approve`, {
      method: 'PUT',
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to approve hospital')
    }

    return response.json()
  }

  async rejectHospital(hospitalId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/admin/registrations/${hospitalId}/reject`, {
      method: 'PUT',
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to reject hospital')
    }
  }

  async getDataAccessRequests(): Promise<DataAccessRequest[]> {
    const response = await fetch(`${API_BASE}/requests`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error('Failed to fetch data access requests')
    }

    const data = await response.json()
    return data.requests || []
  }

  async createDataAccessRequest(data: {
    requestor_email: string
    requested_nodes: string[]
    data_query: any
    purpose: string
    expires_in?: number
  }): Promise<DataAccessRequest> {
    const response = await fetch(`${API_BASE}/requests`, {
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

  async getRequestStatus(requestId: string): Promise<{ request: DataAccessRequest }> {
    const response = await fetch(`${API_BASE}/requests/${requestId}`, {
      headers: this.getHeaders(),
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error('Failed to fetch request status')
    }

    return response.json()
  }

  async getRequestById(requestId: string): Promise<DataAccessRequest> {
    const data = await this.getRequestStatus(requestId)
    return data.request
  }

  // Hospital-specific endpoints
  async hospitalRegister(name: string, email: string, password: string): Promise<{ message: string; hospital: Hospital }> {
    const response = await fetch(`${API_BASE}/hospitals/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Registration failed')
    }

    return response.json()
  }

  async hospitalLogin(email: string, password: string): Promise<LoginResponse & { hospital: Hospital }> {
    const response = await fetch(`${API_BASE}/auth/hospital/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Login failed')
    }

    return response.json()
  }

  async getHospitalStatus(): Promise<{ hospital: Hospital; timestamp: string }> {
    const response = await fetch(`${API_BASE}/hospitals/me`, {
      headers: this.getHeaders(),
      credentials: 'include', // Include cookies
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch hospital status')
    }

    return response.json()
  }
}

export const api = new APIClient()
