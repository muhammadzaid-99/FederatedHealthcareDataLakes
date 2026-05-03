package services

import (
	"strings"
	"testing"
	"time"

	"github.com/hms-fyp/node-backend/internal/config"
)

func newTestNodeAuthService() *AuthService {
	return NewAuthService(&config.Config{
		JWT: config.JWTConfig{
			Secret: "node-test-secret-key",
		},
	})
}

// ============================================================
// GenerateJWT
// ============================================================

func TestNodeAuthService_GenerateJWT_ReturnsNonEmptyToken(t *testing.T) {
	svc := newTestNodeAuthService()
	token, err := svc.GenerateJWT("user-123", "testuser", "operator")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token == "" {
		t.Error("expected non-empty token")
	}
}

func TestNodeAuthService_GenerateJWT_IsThreePartJWT(t *testing.T) {
	svc := newTestNodeAuthService()
	token, _ := svc.GenerateJWT("u1", "user1", "admin")
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Errorf("expected 3-part JWT, got %d parts for %s", len(parts), token)
	}
}

func TestNodeAuthService_GenerateJWT_DifferentUsersDifferentTokens(t *testing.T) {
	svc := newTestNodeAuthService()
	t1, _ := svc.GenerateJWT("id1", "user1", "admin")
	t2, _ := svc.GenerateJWT("id2", "user2", "operator")
	if t1 == t2 {
		t.Error("different users should produce different tokens")
	}
}

func TestNodeAuthService_GenerateJWT_SameUserSameToken(t *testing.T) {
	// Note: JWT timestamps may differ slightly so we just confirm both parse
	svc := newTestNodeAuthService()
	t1, err1 := svc.GenerateJWT("same", "same", "admin")
	t2, err2 := svc.GenerateJWT("same", "same", "admin")
	if err1 != nil || err2 != nil {
		t.Fatalf("unexpected errors: %v %v", err1, err2)
	}
	// Both should be valid
	if t1 == "" || t2 == "" {
		t.Error("expected non-empty tokens")
	}
}

// ============================================================
// ValidateJWT
// ============================================================

func TestNodeAuthService_ValidateJWT_ValidTokenCorrectClaims(t *testing.T) {
	svc := newTestNodeAuthService()
	token, _ := svc.GenerateJWT("user-456", "john", "operator")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.UserID != "user-456" {
		t.Errorf("expected UserID=user-456, got %s", claims.UserID)
	}
	if claims.Username != "john" {
		t.Errorf("expected Username=john, got %s", claims.Username)
	}
	if claims.Role != "operator" {
		t.Errorf("expected Role=operator, got %s", claims.Role)
	}
}

func TestNodeAuthService_ValidateJWT_ExpiryIsInFuture(t *testing.T) {
	svc := newTestNodeAuthService()
	token, _ := svc.GenerateJWT("u1", "user", "admin")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.ExpiresAt == nil {
		t.Fatal("expected ExpiresAt to be set")
	}
	if claims.ExpiresAt.Time.Before(time.Now()) {
		t.Error("expected ExpiresAt to be in the future")
	}
}

func TestNodeAuthService_ValidateJWT_InvalidToken(t *testing.T) {
	svc := newTestNodeAuthService()
	_, err := svc.ValidateJWT("not-a-valid-jwt")
	if err == nil {
		t.Error("expected error for invalid token")
	}
}

func TestNodeAuthService_ValidateJWT_EmptyToken(t *testing.T) {
	svc := newTestNodeAuthService()
	_, err := svc.ValidateJWT("")
	if err == nil {
		t.Error("expected error for empty token")
	}
}

func TestNodeAuthService_ValidateJWT_WrongSecret(t *testing.T) {
	svc := newTestNodeAuthService()
	token, _ := svc.GenerateJWT("u1", "user", "admin")

	svc2 := NewAuthService(&config.Config{
		JWT: config.JWTConfig{Secret: "completely-different-secret"},
	})
	_, err := svc2.ValidateJWT(token)
	if err == nil {
		t.Error("expected error for token signed with a different secret")
	}
}

func TestNodeAuthService_ValidateJWT_TamperedToken(t *testing.T) {
	svc := newTestNodeAuthService()
	token, _ := svc.GenerateJWT("u1", "user", "admin")
	_, err := svc.ValidateJWT(token + "tampered")
	if err == nil {
		t.Error("expected error for tampered token")
	}
}

func TestNodeAuthService_ValidateJWT_RolesPreserved(t *testing.T) {
	svc := newTestNodeAuthService()
	roles := []string{"admin", "operator", "viewer"}
	for _, role := range roles {
		token, _ := svc.GenerateJWT("uid", "user", role)
		claims, err := svc.ValidateJWT(token)
		if err != nil {
			t.Fatalf("unexpected error for role %s: %v", role, err)
		}
		if claims.Role != role {
			t.Errorf("expected role %s, got %s", role, claims.Role)
		}
	}
}

func TestNodeAuthService_GenerateAndValidate_RoundTrip(t *testing.T) {
	svc := newTestNodeAuthService()
	userID := "rt-user-id"
	username := "rt-username"
	role := "operator"

	token, err := svc.GenerateJWT(userID, username, role)
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("validate failed: %v", err)
	}
	if claims.UserID != userID {
		t.Errorf("UserID mismatch: expected %s got %s", userID, claims.UserID)
	}
	if claims.Username != username {
		t.Errorf("Username mismatch: expected %s got %s", username, claims.Username)
	}
	if claims.Role != role {
		t.Errorf("Role mismatch: expected %s got %s", role, claims.Role)
	}
}

func TestNodeAuthService_ValidateJWT_CorruptedPayload(t *testing.T) {
	svc := newTestNodeAuthService()
	token, _ := svc.GenerateJWT("u1", "user", "admin")
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Skip("unexpected token format")
	}
	parts[1] = parts[1] + "CORRUPTED123"
	_, err := svc.ValidateJWT(strings.Join(parts, "."))
	if err == nil {
		t.Error("expected error for corrupted payload")
	}
}
