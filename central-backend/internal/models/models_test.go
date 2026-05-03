package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

// ============================================================
// JSONB tests
// ============================================================

func TestJSONB_Scan_Nil(t *testing.T) {
	var j JSONB
	if err := j.Scan(nil); err != nil {
		t.Fatalf("expected no error on nil, got %v", err)
	}
	if j == nil {
		t.Fatal("expected empty map, got nil")
	}
	if len(j) != 0 {
		t.Fatalf("expected empty map, got %v", j)
	}
}

func TestJSONB_Scan_ValidJSON(t *testing.T) {
	var j JSONB
	data := []byte(`{"key":"value","num":42}`)
	if err := j.Scan(data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j["key"] != "value" {
		t.Errorf("expected key=value, got %v", j["key"])
	}
	if j["num"] == nil {
		t.Error("expected num to be present")
	}
}

func TestJSONB_Scan_InvalidJSON(t *testing.T) {
	var j JSONB
	if err := j.Scan([]byte("not-valid-json{{")); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestJSONB_Scan_NonBytesValue(t *testing.T) {
	var j JSONB
	// Non-[]byte value should return nil error
	if err := j.Scan("a plain string"); err != nil {
		t.Fatalf("expected no error for non-bytes, got %v", err)
	}
}

func TestJSONB_Scan_EmptyObject(t *testing.T) {
	var j JSONB
	if err := j.Scan([]byte(`{}`)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(j) != 0 {
		t.Errorf("expected empty map, got %v", j)
	}
}

func TestJSONB_Scan_NestedJSON(t *testing.T) {
	var j JSONB
	data := []byte(`{"outer":{"inner":"nested"},"list":[1,2,3]}`)
	if err := j.Scan(data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := j["outer"]; !ok {
		t.Error("expected outer key")
	}
}

func TestJSONB_Value_Nil(t *testing.T) {
	var j JSONB // nil map
	val, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != nil {
		t.Errorf("expected nil driver.Value, got %v", val)
	}
}

func TestJSONB_Value_Populated(t *testing.T) {
	j := JSONB{"key": "value", "number": 99}
	val, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, ok := val.([]byte)
	if !ok {
		t.Fatal("expected []byte value")
	}
	var result map[string]interface{}
	if err := json.Unmarshal(b, &result); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if result["key"] != "value" {
		t.Errorf("expected key=value, got %v", result["key"])
	}
}

func TestJSONB_Value_EmptyMap(t *testing.T) {
	j := JSONB{}
	val, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, ok := val.([]byte)
	if !ok {
		t.Fatal("expected []byte")
	}
	if string(b) != "{}" {
		t.Errorf("expected {}, got %s", b)
	}
}

// ============================================================
// JSONBArray tests
// ============================================================

func TestJSONBArray_Scan_Nil(t *testing.T) {
	var j JSONBArray
	if err := j.Scan(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j == nil {
		t.Fatal("expected empty slice, got nil")
	}
}

func TestJSONBArray_Scan_ValidJSON(t *testing.T) {
	var j JSONBArray
	data := []byte(`[1,"two",true,null]`)
	if err := j.Scan(data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(j) != 4 {
		t.Errorf("expected 4 elements, got %d", len(j))
	}
}

func TestJSONBArray_Scan_InvalidJSON(t *testing.T) {
	var j JSONBArray
	if err := j.Scan([]byte("not-json")); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestJSONBArray_Scan_NonBytesValue(t *testing.T) {
	var j JSONBArray
	if err := j.Scan(12345); err != nil {
		t.Fatalf("expected no error for non-bytes, got %v", err)
	}
}

func TestJSONBArray_Scan_EmptyArray(t *testing.T) {
	var j JSONBArray
	if err := j.Scan([]byte(`[]`)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(j) != 0 {
		t.Errorf("expected 0 elements, got %d", len(j))
	}
}

func TestJSONBArray_Value_Nil(t *testing.T) {
	var j JSONBArray // nil
	val, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, ok := val.([]byte)
	if !ok {
		t.Fatal("expected []byte")
	}
	if string(b) != "[]" {
		t.Errorf("expected [], got %s", b)
	}
}

func TestJSONBArray_Value_Populated(t *testing.T) {
	j := JSONBArray{"a", 2, true}
	val, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, ok := val.([]byte)
	if !ok {
		t.Fatal("expected []byte")
	}
	var arr []interface{}
	if err := json.Unmarshal(b, &arr); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if len(arr) != 3 {
		t.Errorf("expected 3, got %d", len(arr))
	}
}

// ============================================================
// Hospital BeforeCreate hook
// ============================================================

func TestHospital_BeforeCreate_GeneratesUUID(t *testing.T) {
	h := &Hospital{}
	if err := h.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestHospital_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	h := &Hospital{ID: existing}
	if err := h.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.ID != existing {
		t.Errorf("expected UUID %v to be preserved, got %v", existing, h.ID)
	}
}

func TestHospital_BeforeCreate_UniquePerCall(t *testing.T) {
	h1, h2 := &Hospital{}, &Hospital{}
	_ = h1.BeforeCreate(nil)
	_ = h2.BeforeCreate(nil)
	if h1.ID == h2.ID {
		t.Error("expected unique UUIDs for different hospitals")
	}
}

// ============================================================
// DataAccessRequest BeforeCreate hook
// ============================================================

func TestDataAccessRequest_BeforeCreate_GeneratesUUID(t *testing.T) {
	d := &DataAccessRequest{}
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.ID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
}

func TestDataAccessRequest_BeforeCreate_SetsDefaultStatus(t *testing.T) {
	d := &DataAccessRequest{}
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Status != RequestStatusPending {
		t.Errorf("expected status PENDING, got %s", d.Status)
	}
}

func TestDataAccessRequest_BeforeCreate_SetsExpiresAt(t *testing.T) {
	d := &DataAccessRequest{}
	before := time.Now()
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should be ~30 days in the future from now
	expected := before.Add(29 * 24 * time.Hour)
	if d.ExpiresAt.Before(expected) {
		t.Errorf("ExpiresAt %v should be ~30 days from %v", d.ExpiresAt, before)
	}
}

func TestDataAccessRequest_BeforeCreate_PreservesStatus(t *testing.T) {
	d := &DataAccessRequest{Status: RequestStatusApproved}
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Status != RequestStatusApproved {
		t.Errorf("expected APPROVED to be preserved, got %s", d.Status)
	}
}

func TestDataAccessRequest_BeforeCreate_PreservesExpiresAt(t *testing.T) {
	preset := time.Now().Add(1 * time.Hour)
	d := &DataAccessRequest{ExpiresAt: preset}
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !d.ExpiresAt.Equal(preset) {
		t.Errorf("expected ExpiresAt %v to be preserved, got %v", preset, d.ExpiresAt)
	}
}

// ============================================================
// NodeAccessResponse BeforeCreate hook
// ============================================================

func TestNodeAccessResponse_BeforeCreate_GeneratesUUID(t *testing.T) {
	n := &NodeAccessResponse{}
	if err := n.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.ID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
}

func TestNodeAccessResponse_BeforeCreate_SetsDefaultStatus(t *testing.T) {
	n := &NodeAccessResponse{}
	if err := n.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Status != ResponseStatusPending {
		t.Errorf("expected PENDING, got %s", n.Status)
	}
}

func TestNodeAccessResponse_BeforeCreate_PreservesStatus(t *testing.T) {
	n := &NodeAccessResponse{Status: ResponseStatusApproved}
	if err := n.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Status != ResponseStatusApproved {
		t.Errorf("expected APPROVED preserved, got %s", n.Status)
	}
}

func TestNodeAccessResponse_BeforeCreate_UniqueUUIDs(t *testing.T) {
	n1, n2 := &NodeAccessResponse{}, &NodeAccessResponse{}
	_ = n1.BeforeCreate(nil)
	_ = n2.BeforeCreate(nil)
	if n1.ID == n2.ID {
		t.Error("expected unique UUIDs")
	}
}

// ============================================================
// AuditLog BeforeCreate hook
// ============================================================

func TestAuditLog_BeforeCreate_GeneratesUUID(t *testing.T) {
	a := &AuditLog{}
	if err := a.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.ID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
}

func TestAuditLog_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	a := &AuditLog{ID: existing}
	if err := a.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.ID != existing {
		t.Errorf("expected UUID preserved, got %v", a.ID)
	}
}

// ============================================================
// Admin BeforeCreate hook
// ============================================================

func TestAdmin_BeforeCreate_GeneratesUUID(t *testing.T) {
	a := &Admin{}
	if err := a.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.ID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
}

func TestAdmin_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	a := &Admin{ID: existing}
	if err := a.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.ID != existing {
		t.Errorf("expected UUID preserved, got %v", a.ID)
	}
}

// ============================================================
// Requestor BeforeCreate hook
// ============================================================

func TestRequestor_BeforeCreate_GeneratesUUID(t *testing.T) {
	r := &Requestor{}
	if err := r.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.ID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
}

func TestRequestor_BeforeCreate_SetsDefaultStatus(t *testing.T) {
	r := &Requestor{}
	if err := r.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Status != RequestorStatusPending {
		t.Errorf("expected PENDING, got %s", r.Status)
	}
}

func TestRequestor_BeforeCreate_PreservesStatus(t *testing.T) {
	r := &Requestor{Status: RequestorStatusApproved}
	if err := r.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Status != RequestorStatusApproved {
		t.Errorf("expected APPROVED preserved, got %s", r.Status)
	}
}

func TestRequestor_BeforeCreate_UniqueUUIDs(t *testing.T) {
	r1, r2 := &Requestor{}, &Requestor{}
	_ = r1.BeforeCreate(nil)
	_ = r2.BeforeCreate(nil)
	if r1.ID == r2.ID {
		t.Error("expected unique UUIDs")
	}
}

// ============================================================
// Status constants
// ============================================================

func TestHospitalStatusConstants_NonEmpty(t *testing.T) {
	constants := map[string]string{
		"PendingApproval":   HospitalStatusPendingApproval,
		"Approved":          HospitalStatusApproved,
		"Rejected":          HospitalStatusRejected,
		"CredentialsIssued": HospitalStatusCredentialsIssued,
		"Active":            HospitalStatusActive,
		"Inactive":          HospitalStatusInactive,
	}
	for name, val := range constants {
		if val == "" {
			t.Errorf("HospitalStatus constant %s should not be empty", name)
		}
	}
}

func TestHospitalStatusConstants_Unique(t *testing.T) {
	seen := make(map[string]bool)
	constants := []string{
		HospitalStatusPendingApproval,
		HospitalStatusApproved,
		HospitalStatusRejected,
		HospitalStatusCredentialsIssued,
		HospitalStatusActive,
		HospitalStatusInactive,
	}
	for _, c := range constants {
		if seen[c] {
			t.Errorf("duplicate hospital status constant: %s", c)
		}
		seen[c] = true
	}
}

func TestRequestStatusConstants_NonEmpty(t *testing.T) {
	constants := []string{
		RequestStatusPending,
		RequestStatusForwarded,
		RequestStatusPartialApproved,
		RequestStatusApproved,
		RequestStatusRejected,
		RequestStatusExpired,
	}
	for _, c := range constants {
		if c == "" {
			t.Error("request status constant should not be empty")
		}
	}
}

func TestRequestStatusConstants_Unique(t *testing.T) {
	seen := make(map[string]bool)
	constants := []string{
		RequestStatusPending,
		RequestStatusForwarded,
		RequestStatusPartialApproved,
		RequestStatusApproved,
		RequestStatusRejected,
		RequestStatusExpired,
	}
	for _, c := range constants {
		if seen[c] {
			t.Errorf("duplicate request status: %s", c)
		}
		seen[c] = true
	}
}

func TestRequestorStatusConstants_NonEmpty(t *testing.T) {
	constants := []string{
		RequestorStatusPending,
		RequestorStatusApproved,
		RequestorStatusRejected,
	}
	for _, c := range constants {
		if c == "" {
			t.Error("requestor status constant should not be empty")
		}
	}
}

func TestResponseStatusConstants_NonEmpty(t *testing.T) {
	constants := []string{
		ResponseStatusPending,
		ResponseStatusApproved,
		ResponseStatusRejected,
	}
	for _, c := range constants {
		if c == "" {
			t.Error("response status constant should not be empty")
		}
	}
}

func TestResponseStatusConstants_Unique(t *testing.T) {
	seen := make(map[string]bool)
	for _, c := range []string{ResponseStatusPending, ResponseStatusApproved, ResponseStatusRejected} {
		if seen[c] {
			t.Errorf("duplicate response status: %s", c)
		}
		seen[c] = true
	}
}
