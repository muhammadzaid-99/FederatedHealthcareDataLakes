package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/config"
	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	cfg *config.Config
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{cfg: cfg}
}

// JWT Claims
type JWTClaims struct {
	UserID   string `json:"user_id"`
	UserType string `json:"user_type"` // "admin" or "hospital"
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// GenerateCredentials generates client_id and client_secret for a hospital
func (s *AuthService) GenerateCredentials() (clientID, clientSecret string, hashedSecret string, err error) {
	// Generate client_id as UUID
	clientID = uuid.New().String()

	// Generate cryptographically secure client_secret
	secretBytes := make([]byte, 32)
	if _, err := rand.Read(secretBytes); err != nil {
		return "", "", "", fmt.Errorf("failed to generate client secret: %w", err)
	}
	clientSecret = base64.URLEncoding.EncodeToString(secretBytes)

	// Hash the client_secret
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(clientSecret), bcrypt.DefaultCost)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to hash client secret: %w", err)
	}
	hashedSecret = string(hashedBytes)

	return clientID, clientSecret, hashedSecret, nil
}

// HashPassword hashes a password using bcrypt
func (s *AuthService) HashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}
	return string(hashedBytes), nil
}

// VerifyPassword verifies a password against a hash
func (s *AuthService) VerifyPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

// GenerateJWT generates a JWT token
func (s *AuthService) GenerateJWT(userID, userType, email string) (string, error) {
	claims := JWTClaims{
		UserID:   userID,
		UserType: userType,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.cfg.App.JWTExpirationTime)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "central-control",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.cfg.App.JWTSecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// ValidateJWT validates a JWT token and returns the claims
func (s *AuthService) ValidateJWT(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.cfg.App.JWTSecret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// AuthenticateHospital authenticates a hospital using client credentials
func (s *AuthService) AuthenticateHospital(clientID, clientSecret string) (*models.Hospital, error) {
	var hospital models.Hospital

	// Find hospital by client_id
	if err := database.DB.Where("client_id = ?", clientID).First(&hospital).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Verify client_secret (check for nil pointer)
	if hospital.ClientSecret == nil {
		return nil, errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*hospital.ClientSecret), []byte(clientSecret)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Check if hospital is in valid state
	if hospital.Status != models.HospitalStatusCredentialsIssued && hospital.Status != models.HospitalStatusActive {
		return nil, fmt.Errorf("hospital account is not active (status: %s)", hospital.Status)
	}

	return &hospital, nil
}

// AuthenticateHospitalByEmail authenticates a hospital using email and password
func (s *AuthService) AuthenticateHospitalByEmail(email, password string) (*models.Hospital, error) {
	var hospital models.Hospital

	// Find hospital by admin email
	if err := database.DB.Where("admin_email = ?", email).First(&hospital).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(hospital.AdminPassword), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Hospital can login in any status to check their dashboard
	// The dashboard will show different information based on status

	return &hospital, nil
}

// AuthenticateAdmin authenticates a central admin
func (s *AuthService) AuthenticateAdmin(username, password string) (*models.Admin, error) {
	var admin models.Admin

	// Find admin by username
	if err := database.DB.Where("username = ? AND is_active = ?", username, true).First(&admin).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(admin.Password), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	return &admin, nil
}

// InitializeDefaultAdmin creates the default admin user if not exists
func (s *AuthService) InitializeDefaultAdmin() error {
	var count int64
	if err := database.DB.Model(&models.Admin{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count admins: %w", err)
	}

	// If admins exist, skip initialization
	if count > 0 {
		return nil
	}

	// Hash the default password
	hashedPassword, err := s.HashPassword(s.cfg.Admin.Password)
	if err != nil {
		return fmt.Errorf("failed to hash default admin password: %w", err)
	}

	// Create default admin
	admin := &models.Admin{
		Username: s.cfg.Admin.Username,
		Password: hashedPassword,
		Email:    "admin@central-control.local",
		IsActive: true,
	}

	if err := database.DB.Create(admin).Error; err != nil {
		return fmt.Errorf("failed to create default admin: %w", err)
	}

	return nil
}

// RegisterRequestor creates a new requestor account with pending status
func (s *AuthService) RegisterRequestor(name, email, password, organization string) (*models.Requestor, error) {
	// Check if email already exists
	var count int64
	if err := database.DB.Model(&models.Requestor{}).Where("email = ?", email).Count(&count).Error; err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if count > 0 {
		return nil, errors.New("email already registered")
	}

	// Hash password
	hashedPassword, err := s.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	requestor := &models.Requestor{
		Name:         name,
		Email:        email,
		PasswordHash: hashedPassword,
		Organization: organization,
		Status:       models.RequestorStatusPending,
	}

	if err := database.DB.Create(requestor).Error; err != nil {
		return nil, fmt.Errorf("failed to create requestor: %w", err)
	}

	return requestor, nil
}

// AuthenticateRequestor authenticates a requestor using email and password
func (s *AuthService) AuthenticateRequestor(email, password string) (*models.Requestor, error) {
	var requestor models.Requestor

	// Find requestor by email
	if err := database.DB.Where("email = ?", email).First(&requestor).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(requestor.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Check if requestor is approved
	if requestor.Status != models.RequestorStatusApproved {
		return nil, fmt.Errorf("account is not approved (status: %s)", requestor.Status)
	}

	return &requestor, nil
}

// GetRequestorByID gets a requestor by ID
func (s *AuthService) GetRequestorByID(id uuid.UUID) (*models.Requestor, error) {
	var requestor models.Requestor
	if err := database.DB.First(&requestor, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("requestor not found")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &requestor, nil
}

// GetPendingRequestors returns all requestors with PENDING status
func (s *AuthService) GetPendingRequestors() ([]models.Requestor, error) {
	var requestors []models.Requestor
	if err := database.DB.Where("status = ?", models.RequestorStatusPending).
		Order("created_at DESC").
		Find(&requestors).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch pending requestors: %w", err)
	}
	return requestors, nil
}

// GetAllRequestors returns all requestors with optional status filter
func (s *AuthService) GetAllRequestors(status string) ([]models.Requestor, error) {
	var requestors []models.Requestor
	query := database.DB

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Order("created_at DESC").Find(&requestors).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch requestors: %w", err)
	}
	return requestors, nil
}

// ApproveRequestor approves a pending requestor
func (s *AuthService) ApproveRequestor(requestorID uuid.UUID) (*models.Requestor, error) {
	var requestor models.Requestor

	if err := database.DB.First(&requestor, "id = ?", requestorID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("requestor not found")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	if requestor.Status != models.RequestorStatusPending {
		return nil, fmt.Errorf("requestor is not in pending status (current: %s)", requestor.Status)
	}

	requestor.Status = models.RequestorStatusApproved
	if err := database.DB.Save(&requestor).Error; err != nil {
		return nil, fmt.Errorf("failed to update requestor: %w", err)
	}

	return &requestor, nil
}

// RejectRequestor rejects a pending requestor
func (s *AuthService) RejectRequestor(requestorID uuid.UUID, reason string) error {
	var requestor models.Requestor

	if err := database.DB.First(&requestor, "id = ?", requestorID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("requestor not found")
		}
		return fmt.Errorf("database error: %w", err)
	}

	if requestor.Status != models.RequestorStatusPending {
		return fmt.Errorf("requestor is not in pending status (current: %s)", requestor.Status)
	}

	requestor.Status = models.RequestorStatusRejected
	if err := database.DB.Save(&requestor).Error; err != nil {
		return fmt.Errorf("failed to update requestor: %w", err)
	}

	return nil
}
