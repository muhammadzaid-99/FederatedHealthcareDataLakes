// API Base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// API client for node-web
export const api = {
  // Node Handshake
  async handshake(data: {
    client_id: string;
    client_secret: string;
    minio_endpoint: string;
    capabilities?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/v1/nodes/handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Handshake failed');
    }

    return response.json();
  },

  // Get Node Status
  async getNodeStatus(accessToken: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/nodes/status`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch node status');
    }

    return response.json();
  },

  // Get All Requests (for the authenticated hospital node)
  async getRequests(accessToken: string, status?: string) {
    const url = new URL(`${API_BASE_URL}/api/v1/requests`);
    if (status) {
      url.searchParams.append('status', status);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch requests');
    }

    return response.json();
  },

  // Get Single Request
  async getRequest(accessToken: string, requestId: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/requests/${requestId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch request');
    }

    return response.json();
  },

  // Submit Response to a Request
  async submitResponse(accessToken: string, requestId: string, data: {
    status: 'APPROVED' | 'REJECTED';
    presigned_url?: string;
    notes?: string;
    valid_hours?: number;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/v1/requests/${requestId}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit response');
    }

    return response.json();
  },
};

// Local storage helpers for node-web
export const storage = {
  setAccessToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('node_access_token', token);
    }
  },

  getAccessToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('node_access_token');
    }
    return null;
  },

  removeAccessToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('node_access_token');
    }
  },

  setHospitalInfo(info: any) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hospital_info', JSON.stringify(info));
    }
  },

  getHospitalInfo(): any | null {
    if (typeof window !== 'undefined') {
      const info = localStorage.getItem('hospital_info');
      return info ? JSON.parse(info) : null;
    }
    return null;
  },

  removeHospitalInfo() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hospital_info');
    }
  },

  clear() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('node_access_token');
      localStorage.removeItem('hospital_info');
    }
  },
};
