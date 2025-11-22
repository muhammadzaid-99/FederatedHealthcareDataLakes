// API Base URL
const API_BASE = '/api/v1';

// Global state
let authToken = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check for existing token
    authToken = localStorage.getItem('authToken');
    if (authToken) {
        showDashboard();
        loadPendingRegistrations();
    } else {
        showLogin();
    }

    // Setup login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
});

// Show/Hide screens
function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    errorDiv.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE}/auth/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            showDashboard();
            loadPendingRegistrations();
        } else {
            errorDiv.textContent = data.error || 'Invalid credentials';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Connection error. Please try again.';
        errorDiv.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
}

// Logout
function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    showLogin();
}

// Switch tabs
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'pending') {
        tabs[0].classList.add('active');
        document.getElementById('pendingTab').classList.remove('hidden');
        document.getElementById('hospitalsTab').classList.add('hidden');
        loadPendingRegistrations();
    } else {
        tabs[1].classList.add('active');
        document.getElementById('pendingTab').classList.add('hidden');
        document.getElementById('hospitalsTab').classList.remove('hidden');
        loadAllHospitals();
    }
}

// API Helper
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// Load pending registrations
async function loadPendingRegistrations() {
    const content = document.getElementById('pendingContent');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const data = await apiRequest('/admin/registrations');
        
        if (data.registrations && data.registrations.length > 0) {
            content.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>Hospital Name</th>
                            <th>Admin Email</th>
                            <th>Status</th>
                            <th>Registered At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.registrations.map(hospital => `
                            <tr>
                                <td><strong>${escapeHtml(hospital.name)}</strong></td>
                                <td>${escapeHtml(hospital.admin_email)}</td>
                                <td><span class="badge badge-pending">${hospital.status}</span></td>
                                <td>${formatDate(hospital.created_at)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-small btn-approve" onclick="approveHospital('${hospital.id}', '${escapeHtml(hospital.name)}')">
                                            Approve
                                        </button>
                                        <button class="btn-small btn-reject" onclick="rejectHospital('${hospital.id}', '${escapeHtml(hospital.name)}')">
                                            Reject
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            content.innerHTML = `
                <div class="empty-state">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <h3>No Pending Registrations</h3>
                    <p>All registrations have been processed.</p>
                </div>
            `;
        }
    } catch (error) {
        content.innerHTML = `<div class="error">Failed to load registrations: ${error.message}</div>`;
    }
}

// Load all hospitals
async function loadAllHospitals() {
    const content = document.getElementById('hospitalsContent');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const data = await apiRequest('/admin/hospitals');
        
        if (data.hospitals && data.hospitals.length > 0) {
            content.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>Hospital Name</th>
                            <th>Admin Email</th>
                            <th>Status</th>
                            <th>Client ID</th>
                            <th>Queue Name</th>
                            <th>Registered At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.hospitals.map(hospital => `
                            <tr>
                                <td><strong>${escapeHtml(hospital.name)}</strong></td>
                                <td>${escapeHtml(hospital.admin_email)}</td>
                                <td><span class="badge ${getBadgeClass(hospital.status)}">${hospital.status}</span></td>
                                <td><code>${hospital.client_id || 'N/A'}</code></td>
                                <td><code>${hospital.queue_name || 'N/A'}</code></td>
                                <td>${formatDate(hospital.created_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            content.innerHTML = `
                <div class="empty-state">
                    <h3>No Hospitals Yet</h3>
                    <p>No hospitals have registered yet.</p>
                </div>
            `;
        }
    } catch (error) {
        content.innerHTML = `<div class="error">Failed to load hospitals: ${error.message}</div>`;
    }
}

// Approve hospital
async function approveHospital(hospitalId, hospitalName) {
    if (!confirm(`Are you sure you want to approve "${hospitalName}"?`)) {
        return;
    }

    try {
        const data = await apiRequest(`/admin/registrations/${hospitalId}/approve`, {
            method: 'PUT',
        });

        // Show credentials modal
        showCredentials(data.hospital);
        
        // Reload pending registrations
        loadPendingRegistrations();
    } catch (error) {
        showMessage(`Failed to approve hospital: ${error.message}`, 'error');
    }
}

// Reject hospital
async function rejectHospital(hospitalId, hospitalName) {
    const reason = prompt(`Reason for rejecting "${hospitalName}":`);
    if (!reason) return;

    try {
        await apiRequest(`/admin/registrations/${hospitalId}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ reason }),
        });

        showMessage(`Hospital "${hospitalName}" has been rejected.`, 'success');
        loadPendingRegistrations();
    } catch (error) {
        showMessage(`Failed to reject hospital: ${error.message}`, 'error');
    }
}

// Show credentials modal
function showCredentials(hospital) {
    const modal = document.getElementById('credentialsModal');
    const content = document.getElementById('credentialsContent');

    content.innerHTML = `
        <div class="credential-box">
            <div class="credential-label">Hospital Name:</div>
            <div class="credential-value">${escapeHtml(hospital.name)}</div>
        </div>
        
        <div class="credential-box">
            <div class="credential-label">Client ID:</div>
            <div class="credential-value" id="clientId">${hospital.client_id}</div>
            <button class="copy-btn" onclick="copyToClipboard('clientId')">Copy</button>
        </div>
        
        <div class="credential-box">
            <div class="credential-label">Client Secret (ONLY SHOWN ONCE):</div>
            <div class="credential-value" id="clientSecret">${hospital.client_secret}</div>
            <button class="copy-btn" onclick="copyToClipboard('clientSecret')">Copy</button>
        </div>
        
        <div class="credential-box">
            <div class="credential-label">Nessie Namespace:</div>
            <div class="credential-value" id="namespace">${hospital.nessie_namespace}</div>
            <button class="copy-btn" onclick="copyToClipboard('namespace')">Copy</button>
        </div>
        
        <div class="credential-box">
            <div class="credential-label">RabbitMQ Queue Name:</div>
            <div class="credential-value" id="queueName">${hospital.queue_name}</div>
            <button class="copy-btn" onclick="copyToClipboard('queueName')">Copy</button>
        </div>
    `;

    modal.classList.add('active');
}

// Close credentials modal
function closeCredentialsModal() {
    document.getElementById('credentialsModal').classList.remove('active');
}

// Copy to clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showMessage('Copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showMessage('Copied to clipboard!', 'success');
    });
}

// Show message
function showMessage(message, type) {
    const messageBox = document.getElementById('messageBox');
    messageBox.className = type === 'error' ? 'error' : 'success';
    messageBox.textContent = message;
    messageBox.classList.remove('hidden');
    
    setTimeout(() => {
        messageBox.classList.add('hidden');
    }, 5000);
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString("en-GB");
}

function getBadgeClass(status) {
    const statusMap = {
        'PENDING_APPROVAL': 'badge-pending',
        'APPROVED': 'badge-active',
        'REJECTED': 'badge-rejected',
        'CREDENTIALS_ISSUED': 'badge-issued',
        'ACTIVE': 'badge-active',
    };
    return statusMap[status] || 'badge-pending';
}
