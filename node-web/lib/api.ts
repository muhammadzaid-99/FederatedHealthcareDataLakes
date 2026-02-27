// API Base URL - Points to node-backend middleware
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

// API client for node-web - All requests go through node-backend
export const api = {
  // Login to node-backend (node-web user authentication)
  async login(username: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important for httpOnly cookies if implemented
      body: JSON.stringify({
        username,
        password,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  },

  // Register new node-web user
  async register(data: {
    username: string;
    email: string;
    password: string;
    role?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    return response.json();
  },

  // Save node configuration (client credentials from central-web)
  async saveConfig(token: string, data: {
    client_id: string;
    client_secret: string;
    queue_name?: string; // No longer required — RabbitMQ removed
    nessie_namespace?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/v1/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save configuration');
    }

    return response.json();
  },

  // Perform handshake with central-backend (via node-backend)
  async handshake(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/handshake`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Handshake failed');
    }

    return response.json();
  },

  // Get Node Status (from node-backend, which has stored config)
  async getNodeStatus(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/node/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch node status');
    }

    return response.json();
  },

  // Refresh status from central-backend
  async refreshStatus(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/node/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to refresh status');
    }

    return response.json();
  },

  // Get messages (legacy — RabbitMQ removed, kept for historical viewing)
  async getMessages(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/messages`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch messages');
    }

    return response.json();
  },

  // Generic GET method for authenticated requests
  async get(endpoint: string) {
    const token = storage.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  },

  // Generic POST method for authenticated requests
  async post(endpoint: string, data?: any) {
    const token = storage.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  },

  // Data Request Management
  async listDataRequests(token: string, status?: string) {
    const url = status 
      ? `${API_BASE_URL}/api/v1/data-requests?status=${status}`
      : `${API_BASE_URL}/api/v1/data-requests`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch data requests');
    }

    return response.json();
  },

  async getDataRequest(token: string, id: string) {
    const response = await fetch(`${API_BASE_URL}/api/v1/data-requests/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch data request');
    }

    return response.json();
  },

  async approveDataRequest(
    token: string, 
    id: string, 
    data: {
      approved_by: string;
      departments: string[];
      date_range_start: string;
      date_range_end: string;
      duration_seconds?: number;
      notes?: string;
    }
  ) {
    const response = await fetch(`${API_BASE_URL}/api/v1/data-requests/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to approve request');
    }

    return response.json();
  },

  async rejectDataRequest(
    token: string, 
    id: string, 
    data: {
      rejected_by: string;
      notes?: string;
    }
  ) {
    const response = await fetch(`${API_BASE_URL}/api/v1/data-requests/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reject request');
    }

    return response.json();
  },
};

// Local storage helpers for node-web
export const storage = {
  // Store JWT token from node-backend
  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('node_web_token', token);
    }
  },

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('node_web_token');
    }
    return null;
  },

  removeToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('node_web_token');
    }
  },

  // Store user info
  setUserInfo(info: any) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('node_web_user', JSON.stringify(info));
    }
  },

  getUserInfo(): any | null {
    if (typeof window !== 'undefined') {
      const info = localStorage.getItem('node_web_user');
      return info ? JSON.parse(info) : null;
    }
    return null;
  },

  removeUserInfo() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('node_web_user');
    }
  },

  // Store node configuration status
  setConfigStatus(configured: boolean) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('node_configured', configured.toString());
    }
  },

  isConfigured(): boolean {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('node_configured') === 'true';
    }
    return false;
  },

  clear() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('node_web_token');
      localStorage.removeItem('node_web_user');
      localStorage.removeItem('node_configured');
    }
  },
};
