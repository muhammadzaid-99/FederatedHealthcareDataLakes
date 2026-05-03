package models

import (
	"database/sql/driver"
	"encoding/json"
	"testing"
	"time"
)

// ============================================================
// STSCredentials.IsExpired
// ============================================================

func TestSTSCredentials_IsExpired_NilExpiration(t *testing.T) {
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		Expiration:      nil,
	}
	if c.IsExpired() {
		t.Error("nil expiration should not be expired")
	}
}

func TestSTSCredentials_IsExpired_FutureExpiration(t *testing.T) {
	future := time.Now().Add(1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		Expiration:      &future,
	}
	if c.IsExpired() {
		t.Error("future expiration should not be expired")
	}
}

func TestSTSCredentials_IsExpired_PastExpiration(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		Expiration:      &past,
	}
	if !c.IsExpired() {
		t.Error("past expiration should be expired")
	}
}

func TestSTSCredentials_IsExpired_Exactly_Now(t *testing.T) {
	// A time very slightly in the past
	slightlyPast := time.Now().Add(-1 * time.Millisecond)
	c := &STSCredentials{Expiration: &slightlyPast}
	if !c.IsExpired() {
		t.Error("time in the past should be expired")
	}
}

func TestSTSCredentials_IsExpired_TenMinutesFromNow(t *testing.T) {
	future := time.Now().Add(10 * time.Minute)
	c := &STSCredentials{Expiration: &future}
	if c.IsExpired() {
		t.Error("ten minutes in future should not be expired")
	}
}

// ============================================================
// STSCredentials.IsValid
// ============================================================

func TestSTSCredentials_IsValid_AllPresent(t *testing.T) {
	future := time.Now().Add(1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		Expiration:      &future,
	}
	if !c.IsValid() {
		t.Error("fully populated non-expired credentials should be valid")
	}
}

func TestSTSCredentials_IsValid_EmptyAccessKeyID(t *testing.T) {
	future := time.Now().Add(1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "",
		SecretAccessKey: "secret",
		Expiration:      &future,
	}
	if c.IsValid() {
		t.Error("empty AccessKeyID should be invalid")
	}
}

func TestSTSCredentials_IsValid_EmptySecretAccessKey(t *testing.T) {
	future := time.Now().Add(1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "",
		Expiration:      &future,
	}
	if c.IsValid() {
		t.Error("empty SecretAccessKey should be invalid")
	}
}

func TestSTSCredentials_IsValid_Expired(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		Expiration:      &past,
	}
	if c.IsValid() {
		t.Error("expired credentials should be invalid")
	}
}

func TestSTSCredentials_IsValid_NilExpiration_WithKeys(t *testing.T) {
	// Nil expiration means never expires — credentials should be valid
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		Expiration:      nil,
	}
	if !c.IsValid() {
		t.Error("credentials with nil expiration and valid keys should be valid")
	}
}

func TestSTSCredentials_IsValid_BothKeysEmpty(t *testing.T) {
	c := &STSCredentials{
		AccessKeyID:     "",
		SecretAccessKey: "",
	}
	if c.IsValid() {
		t.Error("empty AccessKeyID and SecretAccessKey should be invalid")
	}
}

func TestSTSCredentials_IsValid_ExpiredAndEmptyKey(t *testing.T) {
	past := time.Now().Add(-1 * time.Second)
	c := &STSCredentials{
		AccessKeyID:     "",
		SecretAccessKey: "secret",
		Expiration:      &past,
	}
	if c.IsValid() {
		t.Error("expired + empty AccessKeyID should be invalid")
	}
}

func TestSTSCredentials_IsValid_WithSessionToken(t *testing.T) {
	future := time.Now().Add(1 * time.Hour)
	c := &STSCredentials{
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		SessionToken:    "session-token-xyz",
		Expiration:      &future,
	}
	if !c.IsValid() {
		t.Error("credentials with session token should be valid")
	}
}

// ============================================================
// JSONB.Scan
// ============================================================

func TestJSONB_Scan_NilValue(t *testing.T) {
	var j JSONB
	err := j.Scan(nil)
	if err != nil {
		t.Fatalf("unexpected error scanning nil: %v", err)
	}
	if len(j) != 0 {
		t.Errorf("expected empty map, got %v", j)
	}
}

func TestJSONB_Scan_ValidBytes(t *testing.T) {
	var j JSONB
	input := []byte(`{"key": "value", "num": 42}`)
	err := j.Scan(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j["key"] != "value" {
		t.Errorf("expected key=value, got %v", j["key"])
	}
}

func TestJSONB_Scan_EmptyObject(t *testing.T) {
	var j JSONB
	err := j.Scan([]byte(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(j) != 0 {
		t.Errorf("expected empty map, got %v", j)
	}
}

func TestJSONB_Scan_InvalidJSON(t *testing.T) {
	var j JSONB
	err := j.Scan([]byte(`not-json`))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestJSONB_Scan_NonBytesValue(t *testing.T) {
	var j JSONB
	// Passing an int should be silently ignored (returns nil, j stays nil)
	err := j.Scan(12345)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestJSONB_Scan_NestedObject(t *testing.T) {
	var j JSONB
	input := []byte(`{"nested": {"a": 1, "b": 2}}`)
	err := j.Scan(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := j["nested"]; !ok {
		t.Error("expected nested key")
	}
}

// ============================================================
// JSONB.Value
// ============================================================

func TestJSONB_Value_NilMap(t *testing.T) {
	var j JSONB = nil
	v, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != nil {
		t.Errorf("expected nil value for nil JSONB, got %v", v)
	}
}

func TestJSONB_Value_EmptyMap(t *testing.T) {
	j := JSONB{}
	v, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v == nil {
		t.Error("expected non-nil value for empty map")
	}
}

func TestJSONB_Value_WithData(t *testing.T) {
	j := JSONB{"hello": "world"}
	v, err := j.Value()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, ok := v.([]byte)
	if !ok {
		t.Fatalf("expected []byte, got %T", v)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(b, &parsed); err != nil {
		t.Fatalf("value is not valid JSON: %v", err)
	}
	if parsed["hello"] != "world" {
		t.Errorf("expected hello=world, got %v", parsed["hello"])
	}
}

func TestJSONB_Value_ImplementsDriverValuer(t *testing.T) {
	j := JSONB{"test": "data"}
	var _ driver.Valuer = j // compile-time interface check
}

func TestJSONB_Value_RoundTrip(t *testing.T) {
	original := JSONB{"one": 1.0, "two": "deux"}
	v, err := original.Value()
	if err != nil {
		t.Fatalf("Value() error: %v", err)
	}
	var restored JSONB
	err = restored.Scan(v)
	if err != nil {
		t.Fatalf("Scan() error: %v", err)
	}
	if restored["one"] != 1.0 {
		t.Errorf("expected one=1.0, got %v", restored["one"])
	}
	if restored["two"] != "deux" {
		t.Errorf("expected two=deux, got %v", restored["two"])
	}
}
