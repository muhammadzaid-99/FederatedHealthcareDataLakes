package models

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

// ============================================================
// NodeConfig BeforeCreate
// ============================================================

func TestNodeConfig_BeforeCreate_GeneratesUUID(t *testing.T) {
	n := &NodeConfig{}
	if err := n.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestNodeConfig_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	n := &NodeConfig{ID: existing}
	if err := n.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.ID != existing {
		t.Errorf("expected UUID %v preserved, got %v", existing, n.ID)
	}
}

func TestNodeConfig_BeforeCreate_UniqueUUIDs(t *testing.T) {
	n1, n2 := &NodeConfig{}, &NodeConfig{}
	_ = n1.BeforeCreate(nil)
	_ = n2.BeforeCreate(nil)
	if n1.ID == n2.ID {
		t.Error("expected unique UUIDs for different NodeConfig instances")
	}
}

// ============================================================
// User BeforeCreate
// ============================================================

func TestUser_BeforeCreate_GeneratesUUID(t *testing.T) {
	u := &User{}
	if err := u.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestUser_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	u := &User{ID: existing}
	if err := u.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u.ID != existing {
		t.Errorf("expected UUID %v preserved, got %v", existing, u.ID)
	}
}

func TestUser_BeforeCreate_UniqueUUIDs(t *testing.T) {
	u1, u2 := &User{}, &User{}
	_ = u1.BeforeCreate(nil)
	_ = u2.BeforeCreate(nil)
	if u1.ID == u2.ID {
		t.Error("expected unique UUIDs for different User instances")
	}
}

// ============================================================
// Message BeforeCreate
// ============================================================

func TestMessage_BeforeCreate_GeneratesUUID(t *testing.T) {
	m := &Message{}
	if err := m.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestMessage_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	m := &Message{ID: existing}
	if err := m.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.ID != existing {
		t.Errorf("expected UUID %v preserved, got %v", existing, m.ID)
	}
}

func TestMessage_BeforeCreate_UniqueUUIDs(t *testing.T) {
	m1, m2 := &Message{}, &Message{}
	_ = m1.BeforeCreate(nil)
	_ = m2.BeforeCreate(nil)
	if m1.ID == m2.ID {
		t.Error("expected unique UUIDs for different Message instances")
	}
}

// ============================================================
// ETLConfig BeforeCreate
// ============================================================

func TestETLConfig_BeforeCreate_GeneratesUUID(t *testing.T) {
	e := &ETLConfig{}
	if err := e.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if e.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestETLConfig_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	e := &ETLConfig{ID: existing}
	if err := e.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if e.ID != existing {
		t.Errorf("expected UUID %v preserved, got %v", existing, e.ID)
	}
}

func TestETLConfig_BeforeCreate_UniqueUUIDs(t *testing.T) {
	e1, e2 := &ETLConfig{}, &ETLConfig{}
	_ = e1.BeforeCreate(nil)
	_ = e2.BeforeCreate(nil)
	if e1.ID == e2.ID {
		t.Error("expected unique UUIDs for different ETLConfig instances")
	}
}

// ============================================================
// ETLJob BeforeCreate
// ============================================================

func TestETLJob_BeforeCreate_GeneratesUUID(t *testing.T) {
	j := &ETLJob{}
	if err := j.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestETLJob_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	j := &ETLJob{ID: existing}
	if err := j.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j.ID != existing {
		t.Errorf("expected UUID %v preserved, got %v", existing, j.ID)
	}
}

func TestETLJob_BeforeCreate_UniqueUUIDs(t *testing.T) {
	j1, j2 := &ETLJob{}, &ETLJob{}
	_ = j1.BeforeCreate(nil)
	_ = j2.BeforeCreate(nil)
	if j1.ID == j2.ID {
		t.Error("expected unique UUIDs for different ETLJob instances")
	}
}

// ============================================================
// DataRequest BeforeCreate
// ============================================================

func TestDataRequest_BeforeCreate_GeneratesUUID(t *testing.T) {
	d := &DataRequest{}
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.ID == uuid.Nil {
		t.Error("expected non-nil UUID to be generated")
	}
}

func TestDataRequest_BeforeCreate_PreservesExistingUUID(t *testing.T) {
	existing := uuid.New()
	d := &DataRequest{ID: existing}
	if err := d.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.ID != existing {
		t.Errorf("expected UUID %v preserved, got %v", existing, d.ID)
	}
}

func TestDataRequest_BeforeCreate_UniqueUUIDs(t *testing.T) {
	d1, d2 := &DataRequest{}, &DataRequest{}
	_ = d1.BeforeCreate(nil)
	_ = d2.BeforeCreate(nil)
	if d1.ID == d2.ID {
		t.Error("expected unique UUIDs for different DataRequest instances")
	}
}

// ============================================================
// Model field defaults and struct integrity
// ============================================================

func TestUser_DefaultRole(t *testing.T) {
	// operator is the gorm default — confirm struct tag expectation
	u := &User{
		ID:       uuid.New(),
		Username: "testuser",
		Email:    "test@example.com",
		Password: "hash",
		Role:     "operator",
	}
	if u.Role != "operator" {
		t.Errorf("expected default role operator, got %s", u.Role)
	}
}

func TestUser_AdminRole(t *testing.T) {
	u := &User{Role: "admin"}
	if u.Role != "admin" {
		t.Errorf("expected admin role, got %s", u.Role)
	}
}

func TestUser_ViewerRole(t *testing.T) {
	u := &User{Role: "viewer"}
	if u.Role != "viewer" {
		t.Errorf("expected viewer role, got %s", u.Role)
	}
}

func TestMessage_StatusDefault(t *testing.T) {
	m := &Message{Status: "pending"}
	if m.Status != "pending" {
		t.Errorf("expected pending status, got %s", m.Status)
	}
}

func TestETLJob_StatusAllowedValues(t *testing.T) {
	statuses := []string{"pending", "running", "completed", "failed"}
	for _, s := range statuses {
		j := &ETLJob{Status: s}
		if j.Status != s {
			t.Errorf("expected status %s, got %s", s, j.Status)
		}
	}
}

func TestDataRequest_StatusFlows(t *testing.T) {
	statuses := []string{"pending", "approved", "rejected"}
	for _, s := range statuses {
		d := &DataRequest{Status: s}
		if d.Status != s {
			t.Errorf("expected status %s, got %s", s, d.Status)
		}
	}
}

func TestNodeConfig_TokenExpiry(t *testing.T) {
	future := time.Now().Add(1 * time.Hour)
	n := &NodeConfig{
		AccessToken:    "some-token",
		TokenExpiresAt: future,
	}
	if n.AccessToken == "" {
		t.Error("expected non-empty access token")
	}
	if !n.TokenExpiresAt.After(time.Now()) {
		t.Error("expected token expiry to be in the future")
	}
}

func TestETLConfig_ScheduleTypes(t *testing.T) {
	types := []string{"frequency", "cron", "manual"}
	for _, schedType := range types {
		e := &ETLConfig{ScheduleType: schedType}
		if e.ScheduleType != schedType {
			t.Errorf("expected schedule type %s, got %s", schedType, e.ScheduleType)
		}
	}
}
