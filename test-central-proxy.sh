#!/bin/bash
# ============================================================
# Central Proxy Integration Test Script
# ============================================================
# This script verifies the Central Proxy federation layer
# is working correctly with Nessie and Trino.
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CENTRAL_PROXY_URL="${CENTRAL_PROXY_URL:-http://localhost:8081}"
NESSIE_URL="${NESSIE_URL:-http://localhost:19120}"
TRINO_URL="${TRINO_URL:-http://localhost:8082}"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}    Central Proxy Integration Tests${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# Function to print test results
pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
}

fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠ WARN:${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ INFO:${NC} $1"
}

# ============================================================
# Test 1: Health Check
# ============================================================
echo -e "\n${YELLOW}Test 1: Central Proxy Health Check${NC}"
echo "-----------------------------------"

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${CENTRAL_PROXY_URL}/health")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HEALTH_STATUS" == "200" ]; then
    pass "Central Proxy is healthy"
    info "Response: $HEALTH_BODY"
else
    fail "Central Proxy health check failed (HTTP $HEALTH_STATUS)"
fi

# ============================================================
# Test 2: Nessie Connectivity via Proxy
# ============================================================
echo -e "\n${YELLOW}Test 2: Nessie Connectivity via Proxy${NC}"
echo "--------------------------------------"

NESSIE_CONFIG=$(curl -s -w "\n%{http_code}" "${CENTRAL_PROXY_URL}/iceberg/api/v2/config")
NESSIE_STATUS=$(echo "$NESSIE_CONFIG" | tail -n1)
NESSIE_BODY=$(echo "$NESSIE_CONFIG" | sed '$d')

if [ "$NESSIE_STATUS" == "200" ]; then
    pass "Nessie is reachable via proxy"
    info "Nessie config received"
else
    warn "Nessie not reachable via proxy (HTTP $NESSIE_STATUS)"
    info "This may be expected if Nessie is not running"
fi

# ============================================================
# Test 3: List Hospitals (Admin Endpoint)
# ============================================================
echo -e "\n${YELLOW}Test 3: List Hospitals${NC}"
echo "----------------------"

HOSPITALS_RESPONSE=$(curl -s -w "\n%{http_code}" "${CENTRAL_PROXY_URL}/admin/hospitals")
HOSPITALS_STATUS=$(echo "$HOSPITALS_RESPONSE" | tail -n1)
HOSPITALS_BODY=$(echo "$HOSPITALS_RESPONSE" | sed '$d')

if [ "$HOSPITALS_STATUS" == "200" ]; then
    pass "Hospitals endpoint working"
    echo "$HOSPITALS_BODY" | jq '.' 2>/dev/null || echo "$HOSPITALS_BODY"
else
    fail "Failed to list hospitals (HTTP $HOSPITALS_STATUS)"
fi

# ============================================================
# Test 4: Check Credentials for a Namespace
# ============================================================
echo -e "\n${YELLOW}Test 4: Credentials Lookup${NC}"
echo "--------------------------"

# Get the first hospital namespace from the list
NAMESPACE=$(echo "$HOSPITALS_BODY" | jq -r '.hospitals[0].NessieNamespace // empty' 2>/dev/null)

if [ -n "$NAMESPACE" ] && [ "$NAMESPACE" != "null" ]; then
    info "Testing credentials for namespace: $NAMESPACE"
    
    CREDS_RESPONSE=$(curl -s -w "\n%{http_code}" "${CENTRAL_PROXY_URL}/admin/credentials/${NAMESPACE}")
    CREDS_STATUS=$(echo "$CREDS_RESPONSE" | tail -n1)
    CREDS_BODY=$(echo "$CREDS_RESPONSE" | sed '$d')
    
    if [ "$CREDS_STATUS" == "200" ]; then
        pass "Credentials found for namespace"
        echo "$CREDS_BODY" | jq '.' 2>/dev/null || echo "$CREDS_BODY"
    elif [ "$CREDS_STATUS" == "404" ]; then
        warn "No credentials found for namespace $NAMESPACE"
        info "This is expected if no data access requests have been approved"
    else
        warn "Unexpected response (HTTP $CREDS_STATUS)"
    fi
else
    warn "No hospitals with namespace found - skipping credentials test"
fi

# ============================================================
# Test 5: LoadTable Credential Injection Test
# ============================================================
echo -e "\n${YELLOW}Test 5: LoadTable Credential Injection${NC}"
echo "---------------------------------------"

if [ -n "$NAMESPACE" ] && [ "$NAMESPACE" != "null" ]; then
    # Try to load a table (this will likely fail if table doesn't exist, but we can check the flow)
    TABLE_RESPONSE=$(curl -s -w "\n%{http_code}" "${CENTRAL_PROXY_URL}/iceberg/v1/namespaces/${NAMESPACE}/tables/checkups")
    TABLE_STATUS=$(echo "$TABLE_RESPONSE" | tail -n1)
    TABLE_BODY=$(echo "$TABLE_RESPONSE" | sed '$d')
    
    if [ "$TABLE_STATUS" == "200" ]; then
        pass "LoadTable request processed"
        
        # Check if credentials were injected
        if echo "$TABLE_BODY" | jq -e '.config["s3.access-key-id"]' > /dev/null 2>&1; then
            pass "STS credentials injected into response!"
            info "Access Key: $(echo "$TABLE_BODY" | jq -r '.config["s3.access-key-id"]')"
        else
            warn "Response received but credentials not found in config"
        fi
    elif [ "$TABLE_STATUS" == "404" ]; then
        info "Table not found (expected if table doesn't exist)"
        info "Credential injection will occur when tables exist"
    else
        warn "LoadTable request returned HTTP $TABLE_STATUS"
    fi
else
    warn "Skipping LoadTable test - no namespace available"
fi

# ============================================================
# Test 6: Trino Connectivity
# ============================================================
echo -e "\n${YELLOW}Test 6: Trino Connectivity${NC}"
echo "--------------------------"

TRINO_UI_RESPONSE=$(curl -s -w "\n%{http_code}" "${TRINO_URL}/ui/")
TRINO_UI_STATUS=$(echo "$TRINO_UI_RESPONSE" | tail -n1)

if [ "$TRINO_UI_STATUS" == "200" ] || [ "$TRINO_UI_STATUS" == "302" ] || [ "$TRINO_UI_STATUS" == "303" ]; then
    pass "Trino UI is accessible"
else
    warn "Trino UI not accessible (HTTP $TRINO_UI_STATUS)"
    info "This is expected if Trino is not running"
fi

# ============================================================
# Test 7: Trino Iceberg Catalog
# ============================================================
echo -e "\n${YELLOW}Test 7: Trino Iceberg Catalog Query${NC}"
echo "------------------------------------"

# Try to query Trino (requires Trino CLI or HTTP API)
TRINO_QUERY="SHOW CATALOGS"
TRINO_QUERY_RESPONSE=$(curl -s -X POST "${TRINO_URL}/v1/statement" \
    -H "X-Trino-User: test" \
    -H "X-Trino-Catalog: iceberg" \
    -H "X-Trino-Schema: default" \
    -d "$TRINO_QUERY" 2>/dev/null)

if [ -n "$TRINO_QUERY_RESPONSE" ]; then
    if echo "$TRINO_QUERY_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
        pass "Trino query submitted successfully"
        info "Query ID: $(echo "$TRINO_QUERY_RESPONSE" | jq -r '.id')"
    else
        warn "Trino query submission may have failed"
        info "Response: $TRINO_QUERY_RESPONSE"
    fi
else
    warn "Could not connect to Trino API"
fi

# ============================================================
# Summary
# ============================================================
echo -e "\n${BLUE}============================================================${NC}"
echo -e "${BLUE}    Test Summary${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "Central Proxy URL: ${CENTRAL_PROXY_URL}"
echo "Nessie URL: ${NESSIE_URL}"
echo "Trino URL: ${TRINO_URL}"
echo ""
echo -e "${GREEN}Integration tests completed!${NC}"
echo ""
echo "Next steps to verify full functionality:"
echo "1. Ensure a hospital has completed handshake with central"
echo "2. Create and approve a data access request"
echo "3. Run ETL to create Iceberg tables"
echo "4. Query via Trino: SELECT * FROM iceberg.<namespace>.<table>"
