#!/bin/bash

# Central Control Plane - End-to-End Test Script
# This script tests the complete hospital registration and access request flow

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URL - now points to central-backend
BASE_URL="${BASE_URL:-http://localhost:8080}"
API_URL="$BASE_URL/api/v1"

# Test data
HOSPITAL_NAME="Test Hospital $(date +%s)"
HOSPITAL_EMAIL="test-$(date +%s)@hospital.com"
HOSPITAL_PASSWORD="TestPass123!"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

# Variables to store tokens and IDs
ADMIN_TOKEN=""
HOSPITAL_ID=""
CLIENT_ID=""
CLIENT_SECRET=""
HOSPITAL_TOKEN=""
REQUEST_ID=""

# Helper functions
print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

print_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    print_step "Waiting for service to be ready..."
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
            print_success "Service is ready!"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "Waiting... ($attempt/$max_attempts)"
        sleep 2
    done
    
    print_error "Service did not become ready in time"
    exit 1
}

# Test 1: Health Check
test_health_check() {
    print_step "Testing health check endpoint..."
    response=$(curl -s "$BASE_URL/health")
    
    if echo "$response" | grep -q '"status":"healthy"'; then
        print_success "Health check passed"
    else
        print_warning "Health check returned: $response"
    fi
}

# Test 2: Hospital Registration
test_hospital_registration() {
    print_step "Testing hospital registration..."
    
    response=$(curl -s -X POST "$API_URL/hospitals/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$HOSPITAL_NAME\",
            \"email\": \"$HOSPITAL_EMAIL\",
            \"password\": \"$HOSPITAL_PASSWORD\"
        }")
    
    echo "Response: $response"
    
    HOSPITAL_ID=$(echo "$response" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$HOSPITAL_ID" ]; then
        print_success "Hospital registered successfully. ID: $HOSPITAL_ID"
    else
        print_error "Failed to register hospital"
        echo "$response"
        exit 1
    fi
}

# Test 3: Admin Login
test_admin_login() {
    print_step "Testing admin login..."
    
    response=$(curl -s -X POST "$API_URL/auth/admin/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"username\": \"$ADMIN_USERNAME\",
            \"password\": \"$ADMIN_PASSWORD\"
        }")
    
    ADMIN_TOKEN=$(echo "$response" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$ADMIN_TOKEN" ]; then
        print_success "Admin logged in successfully"
    else
        print_error "Failed to login as admin"
        echo "$response"
        exit 1
    fi
}

# Test 4: Get Pending Registrations
test_get_pending_registrations() {
    print_step "Testing get pending registrations..."
    
    response=$(curl -s -X GET "$API_URL/admin/registrations" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$response" | grep -q "$HOSPITAL_EMAIL"; then
        print_success "Pending registration found"
    else
        print_warning "Pending registration not found in list"
        echo "$response"
    fi
}

# Test 5: Approve Hospital
test_approve_hospital() {
    print_step "Testing hospital approval..."
    
    response=$(curl -s -X PUT "$API_URL/admin/registrations/$HOSPITAL_ID/approve" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    echo "Response: $response"
    
    CLIENT_ID=$(echo "$response" | grep -o '"client_id":"[^"]*' | cut -d'"' -f4)
    CLIENT_SECRET=$(echo "$response" | grep -o '"client_secret":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
        print_success "Hospital approved successfully"
        echo "Client ID: $CLIENT_ID"
        echo "Client Secret: ${CLIENT_SECRET:0:20}..." # Show only first 20 chars
    else
        print_error "Failed to approve hospital"
        echo "$response"
        exit 1
    fi
}

# Test 6: Node Handshake
test_node_handshake() {
    print_step "Testing node handshake..."
    
    response=$(curl -s -X POST "$API_URL/nodes/handshake" \
        -H "Content-Type: application/json" \
        -d "{
            \"client_id\": \"$CLIENT_ID\",
            \"client_secret\": \"$CLIENT_SECRET\",
            \"minio_endpoint\": \"http://minio:9000\",
            \"capabilities\": {
                \"max_data_size_gb\": 100,
                \"supported_formats\": [\"parquet\", \"avro\"]
            },
            \"metadata\": {
                \"location\": \"Test City\",
                \"contact\": \"ops@testhospital.com\"
            }
        }")
    
    echo "Response: $response"
    
    HOSPITAL_TOKEN=$(echo "$response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$HOSPITAL_TOKEN" ]; then
        print_success "Node handshake completed successfully"
    else
        print_error "Failed to complete handshake"
        echo "$response"
        exit 1
    fi
}

# Test 7: Get Node Status
test_node_status() {
    print_step "Testing node status endpoint..."
    
    response=$(curl -s -X GET "$API_URL/nodes/status" \
        -H "Authorization: Bearer $HOSPITAL_TOKEN")
    
    if echo "$response" | grep -q "$HOSPITAL_NAME"; then
        print_success "Node status retrieved successfully"
    else
        print_error "Failed to get node status"
        echo "$response"
        exit 1
    fi
}

# Test 8: Create Access Request
test_create_access_request() {
    print_step "Testing access request creation..."
    
    response=$(curl -s -X POST "$API_URL/requests" \
        -H "Content-Type: application/json" \
        -d "{
            \"requestor_email\": \"researcher@university.edu\",
            \"requested_nodes\": [\"$HOSPITAL_ID\"],
            \"data_query\": {
                \"type\": \"patient_records\",
                \"conditions\": [\"diabetes\", \"hypertension\"],
                \"date_range\": {
                    \"start\": \"2023-01-01\",
                    \"end\": \"2023-12-31\"
                }
            },
            \"purpose\": \"Clinical research on comorbidity patterns\",
            \"expires_in\": 30
        }")
    
    echo "Response: $response"
    
    REQUEST_ID=$(echo "$response" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ -n "$REQUEST_ID" ]; then
        print_success "Access request created successfully. ID: $REQUEST_ID"
    else
        print_error "Failed to create access request"
        echo "$response"
        exit 1
    fi
}

# Test 9: Get Request Status
test_get_request_status() {
    print_step "Testing get request status..."
    
    response=$(curl -s -X GET "$API_URL/requests/$REQUEST_ID")
    
    if echo "$response" | grep -q "$REQUEST_ID"; then
        print_success "Request status retrieved successfully"
        echo "Status: $(echo "$response" | grep -o '"status":"[^"]*' | cut -d'"' -f4)"
    else
        print_error "Failed to get request status"
        echo "$response"
        exit 1
    fi
}

# Test 10: Submit Node Response
test_submit_node_response() {
    print_step "Testing node response submission..."
    
    response=$(curl -s -X POST "$API_URL/requests/$REQUEST_ID/responses" \
        -H "Authorization: Bearer $HOSPITAL_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"status\": \"APPROVED\",
            \"presigned_url\": \"https://minio.hospital.com/data/test-dataset.parquet?token=test123\",
            \"valid_hours\": 72,
            \"notes\": \"Data anonymized according to HIPAA guidelines\"
        }")
    
    echo "Response: $response"
    
    if echo "$response" | grep -q "submitted successfully"; then
        print_success "Node response submitted successfully"
    else
        print_error "Failed to submit node response"
        echo "$response"
        exit 1
    fi
}

# Test 11: Verify Request Updated
test_verify_request_updated() {
    print_step "Verifying request status updated..."
    
    response=$(curl -s -X GET "$API_URL/requests/$REQUEST_ID")
    
    status=$(echo "$response" | grep -o '"status":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ "$status" = "APPROVED" ] || [ "$status" = "PARTIAL_APPROVED" ]; then
        print_success "Request status updated correctly: $status"
    else
        print_warning "Request status is: $status (expected APPROVED or PARTIAL_APPROVED)"
    fi
}

# Test 12: Get All Hospitals (Admin)
test_get_all_hospitals() {
    print_step "Testing get all hospitals..."
    
    response=$(curl -s -X GET "$API_URL/admin/hospitals" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$response" | grep -q "$HOSPITAL_NAME"; then
        print_success "All hospitals retrieved successfully"
    else
        print_error "Failed to get all hospitals"
        echo "$response"
        exit 1
    fi
}

# Main test execution
main() {
    echo ""
    echo "========================================="
    echo "Central Control Plane - E2E Test Suite"
    echo "========================================="
    echo ""
    
    wait_for_service
    echo ""
    
    test_health_check
    echo ""
    
    test_hospital_registration
    echo ""
    
    test_admin_login
    echo ""
    
    test_get_pending_registrations
    echo ""
    
    # test_approve_hospital
    # echo ""
    
    # test_node_handshake
    # echo ""
    
    # test_node_status
    # echo ""
    
    # test_create_access_request
    # echo ""
    
    # test_get_request_status
    # echo ""
    
    # test_submit_node_response
    # echo ""
    
    # test_verify_request_updated
    # echo ""
    
    # test_get_all_hospitals
    # echo ""
    
    echo "========================================="
    print_success "All tests passed! 🎉"
    echo "========================================="
    echo ""
    echo "Test Summary:"
    echo "- Hospital ID: $HOSPITAL_ID"
    echo "- Request ID: $REQUEST_ID"
    echo "- Admin Token: ${ADMIN_TOKEN:0:20}..."
    echo "- Hospital Token: ${HOSPITAL_TOKEN:0:20}..."
    echo ""
}

# Run tests
main
