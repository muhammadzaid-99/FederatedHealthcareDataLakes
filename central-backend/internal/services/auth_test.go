package services

import (
	"strings"
	"testing"
	"time"

	"github.com/hms-fyp/central-control/internal/config"
)

// newTestAuthService creates an AuthService with test configuration (no DB).
func newTestAuthService() *AuthService {
	return NewAuthService(&config.Config{
		App: config.AppConfig{
			JWTSecret:         "test-secret-key-for-unit-tests",
			JWTExpirationTime: 24 * time.Hour,
		},
	})
}

// ============================================================
// HashPassword
// ============================================================

func TestAuthService_HashPassword_ReturnsNonEmptyHash(t *testing.T) {
	svc := newTestAuthService()
	hash, err := svc.HashPassword("mypassword")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hash == "" {
		t.Error("expected non-empty hash")
	}
}

func TestAuthService_HashPassword_DoesNotReturnPlainText(t *testing.T) {
	svc := newTestAuthService()
	hash, err := svc.HashPassword("plaintext")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hash == "plaintext" {
		t.Error("hash should not equal plain text")
	}
}

func TestAuthService_HashPassword_DifferentSaltEachCall(t *testing.T) {
	svc := newTestAuthService()
	hash1, _ := svc.HashPassword("samepassword")
	hash2, _ := svc.HashPassword("samepassword")
	// bcrypt uses random salt per call
	if hash1 == hash2 {
		t.Error("expected different hashes due to bcrypt random salt")
	}
}

func TestAuthService_HashPassword_LongPassword(t *testing.T) {
	svc := newTestAuthService()
	// bcrypt max is 72 bytes; use a password just at the limit
	long := strings.Repeat("a", 72)
	_, err := svc.HashPassword(long)
	if err != nil {
		t.Fatalf("unexpected error for 72-char password: %v", err)
	}
}

func TestAuthService_HashPassword_SpecialCharacters(t *testing.T) {
	svc := newTestAuthService()
	_, err := svc.HashPassword("p@$$w0rd!#%^&*()")
	if err != nil {
		t.Fatalf("unexpected error for special chars: %v", err)
	}
}

// ============================================================
// VerifyPassword
// ============================================================

func TestAuthService_VerifyPassword_CorrectPassword(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("correctpassword")
	if err := svc.VerifyPassword(hash, "correctpassword"); err != nil {
		t.Errorf("expected nil error for correct password, got %v", err)
	}
}

func TestAuthService_VerifyPassword_WrongPassword(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("correctpassword")
	if err := svc.VerifyPassword(hash, "wrongpassword"); err == nil {
		t.Error("expected error for wrong password")
	}
}

func TestAuthService_VerifyPassword_EmptyAgainstNonEmpty(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("somepassword")
	if err := svc.VerifyPassword(hash, ""); err == nil {
		t.Error("expected error for empty password vs non-empty hash")
	}
}

func TestAuthService_VerifyPassword_SimilarButDifferentPasswords(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("password1")
	if err := svc.VerifyPassword(hash, "password2"); err == nil {
		t.Error("expected error for similar but different password")
	}
}

func TestAuthService_VerifyPassword_CaseSensitive(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("Password")
	if err := svc.VerifyPassword(hash, "password"); err == nil {
		t.Error("expected error - passwords are case sensitive")
	}
}

func TestAuthService_VerifyPassword_SpecialChars(t *testing.T) {
	svc := newTestAuthService()
	pw := "p@$$w0rd!#%^"
	hash, _ := svc.HashPassword(pw)
	if err := svc.VerifyPassword(hash, pw); err != nil {
		t.Errorf("expected nil for matching special chars password: %v", err)
	}
}

// ============================================================
// GenerateCredentials
// ============================================================

func TestAuthService_GenerateCredentials_AllFieldsNonEmpty(t *testing.T) {
	svc := newTestAuthService()
	clientID, clientSecret, hashedSecret, err := svc.GenerateCredentials()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if clientID == "" {
		t.Error("expected non-empty clientID")
	}
	if clientSecret == "" {
		t.Error("expected non-empty clientSecret")
	}
	if hashedSecret == "" {
		t.Error("expected non-empty hashedSecret")
	}
}

func TestAuthService_GenerateCredentials_UniqueIDsPerCall(t *testing.T) {
	svc := newTestAuthService()
	id1, _, _, _ := svc.GenerateCredentials()
	id2, _, _, _ := svc.GenerateCredentials()
	if id1 == id2 {
		t.Error("expected unique client IDs per call")
	}
}

func TestAuthService_GenerateCredentials_UniqueSecretsPerCall(t *testing.T) {
	svc := newTestAuthService()
	_, s1, _, _ := svc.GenerateCredentials()
	_, s2, _, _ := svc.GenerateCredentials()
	if s1 == s2 {
		t.Error("expected unique client secrets per call")
	}
}

func TestAuthService_GenerateCredentials_SecretVerifiesAgainstHash(t *testing.T) {
	svc := newTestAuthService()
	_, clientSecret, hashedSecret, _ := svc.GenerateCredentials()
	if err := svc.VerifyPassword(hashedSecret, clientSecret); err != nil {
		t.Errorf("plain secret should verify against its hash: %v", err)
	}
}

func TestAuthService_GenerateCredentials_ClientIDIsUUID(t *testing.T) {
	svc := newTestAuthService()
	clientID, _, _, err := svc.GenerateCredentials()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Basic UUID format check: 36 chars with dashes
	if len(clientID) != 36 {
		t.Errorf("expected UUID length 36, got %d for %s", len(clientID), clientID)
	}
	parts := strings.Split(clientID, "-")
	if len(parts) != 5 {
		t.Errorf("expected UUID with 4 dashes, got %s", clientID)
	}
}

// ============================================================
// GenerateJWT
// ============================================================

func TestAuthService_GenerateJWT_ReturnsNonEmptyToken(t *testing.T) {
	svc := newTestAuthService()
	token, err := svc.GenerateJWT("user-123", "admin", "admin@test.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token == "" {
		t.Error("expected non-empty token")
	}
}

func TestAuthService_GenerateJWT_IsThreePartJWT(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("u1", "admin", "a@b.com")
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Errorf("expected JWT with 3 parts, got %d for %s", len(parts), token)
	}
}

func TestAuthService_GenerateJWT_DifferentTokensForDifferentUsers(t *testing.T) {
	svc := newTestAuthService()
	t1, _ := svc.GenerateJWT("user1", "admin", "user1@test.com")
	t2, _ := svc.GenerateJWT("user2", "hospital", "user2@test.com")
	if t1 == t2 {
		t.Error("different users should produce different tokens")
	}
}

// ============================================================
// ValidateJWT
// ============================================================

func TestAuthService_ValidateJWT_ValidTokenReturnsCorrectClaims(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("user-456", "hospital", "hosp@test.com")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.UserID != "user-456" {
		t.Errorf("expected UserID=user-456, got %s", claims.UserID)
	}
	if claims.UserType != "hospital" {
		t.Errorf("expected UserType=hospital, got %s", claims.UserType)
	}
	if claims.Email != "hosp@test.com" {
		t.Errorf("expected Email=hosp@test.com, got %s", claims.Email)
	}
}

func TestAuthService_ValidateJWT_HasCorrectIssuer(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("u1", "admin", "a@b.com")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Issuer != "central-control" {
		t.Errorf("expected issuer=central-control, got %s", claims.Issuer)
	}
}

func TestAuthService_ValidateJWT_ExpiryIsSet(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("u1", "admin", "a@b.com")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.ExpiresAt == nil {
		t.Error("expected ExpiresAt to be set")
	}
	if claims.ExpiresAt.Time.Before(time.Now()) {
		t.Error("expected ExpiresAt to be in the future")
	}
}

func TestAuthService_ValidateJWT_InvalidToken(t *testing.T) {
	svc := newTestAuthService()
	_, err := svc.ValidateJWT("not-a-valid-token")
	if err == nil {
		t.Error("expected error for invalid token")
	}
}

func TestAuthService_ValidateJWT_EmptyToken(t *testing.T) {
	svc := newTestAuthService()
	_, err := svc.ValidateJWT("")
	if err == nil {
		t.Error("expected error for empty token")
	}
}

func TestAuthService_ValidateJWT_WrongSecret(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("u1", "admin", "a@b.com")

	svc2 := NewAuthService(&config.Config{
		App: config.AppConfig{
			JWTSecret:         "completely-different-secret",
			JWTExpirationTime: 24 * time.Hour,
		},
	})
	_, err := svc2.ValidateJWT(token)
	if err == nil {
		t.Error("expected error for token signed with different secret")
	}
}

func TestAuthService_ValidateJWT_ExpiredToken(t *testing.T) {
	svc := NewAuthService(&config.Config{
		App: config.AppConfig{
			JWTSecret:         "test-secret",
			JWTExpirationTime: -1 * time.Second, // already expired
		},
	})
	token, err := svc.GenerateJWT("u1", "admin", "a@b.com")
	if err != nil {
		t.Fatalf("unexpected error generating token: %v", err)
	}
	_, err = svc.ValidateJWT(token)
	if err == nil {
		t.Error("expected error for expired token")
	}
}

func TestAuthService_ValidateJWT_TamperedToken(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("u1", "admin", "a@b.com")
	_, err := svc.ValidateJWT(token + "tampered")
	if err == nil {
		t.Error("expected error for tampered token")
	}
}

func TestAuthService_ValidateJWT_ModifiedHeader(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("u1", "admin", "a@b.com")
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Skip("unexpected token format")
	}
	// Corrupt the payload part
	parts[1] = parts[1] + "CORRUPTED"
	_, err := svc.ValidateJWT(strings.Join(parts, "."))
	if err == nil {
		t.Error("expected error for corrupted token payload")
	}
}

func TestAuthService_ValidateJWT_AdminUserType(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("admin-id", "admin", "admin@central.com")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.UserType != "admin" {
		t.Errorf("expected admin user type, got %s", claims.UserType)
	}
}

func TestAuthService_ValidateJWT_HospitalUserType(t *testing.T) {
	svc := newTestAuthService()
	token, _ := svc.GenerateJWT("hosp-id", "hospital", "hosp@hospital.com")
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.UserType != "hospital" {
		t.Errorf("expected hospital user type, got %s", claims.UserType)
	}
}

func TestAuthService_GenerateAndValidate_RoundTrip(t *testing.T) {
	svc := newTestAuthService()
	userID := "round-trip-user"
	userType := "requestor"
	email := "requestor@example.com"

	token, err := svc.GenerateJWT(userID, userType, email)
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	claims, err := svc.ValidateJWT(token)
	if err != nil {
		t.Fatalf("validate failed: %v", err)
	}
	if claims.UserID != userID || claims.UserType != userType || claims.Email != email {
		t.Errorf("round-trip mismatch: got UserID=%s UserType=%s Email=%s",
			claims.UserID, claims.UserType, claims.Email)
	}
}
