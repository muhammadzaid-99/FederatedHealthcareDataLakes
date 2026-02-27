package services

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/config"
	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/models"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
)

type HospitalService struct {
	cfg           *config.Config
	authService   *AuthService
	nessieService *NessieService
	// rabbitMQ removed — nodes now fetch requests via HTTP REST
	auditService *AuditService
}

func NewHospitalService(
	cfg *config.Config,
	authService *AuthService,
	nessieService *NessieService,
	auditService *AuditService,
) *HospitalService {
	return &HospitalService{
		cfg:           cfg,
		authService:   authService,
		nessieService: nessieService,
		auditService:  auditService,
	}
}

// RegisterHospital handles initial hospital registration
func (s *HospitalService) RegisterHospital(name, adminEmail, password string) (*models.Hospital, error) {
	// Check if email already exists
	var existingHospital models.Hospital
	if err := database.DB.Where("admin_email = ?", adminEmail).First(&existingHospital).Error; err == nil {
		return nil, fmt.Errorf("hospital with this email already exists")
	}

	// Hash password
	hashedPassword, err := s.authService.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Create hospital record
	hospital := &models.Hospital{
		Name:          name,
		AdminEmail:    adminEmail,
		AdminPassword: hashedPassword,
		Status:        models.HospitalStatusPendingApproval,
	}

	if err := database.DB.Create(hospital).Error; err != nil {
		return nil, fmt.Errorf("failed to create hospital: %w", err)
	}

	// Audit log
	s.auditService.Log("hospital", hospital.ID.String(), "register", "system", models.JSONB{
		"name":  name,
		"email": adminEmail,
	})

	logrus.WithFields(logrus.Fields{
		"hospital_id": hospital.ID,
		"name":        name,
	}).Info("Hospital registered successfully")

	return hospital, nil
}

// ApproveHospital approves a pending hospital registration
func (s *HospitalService) ApproveHospital(hospitalID uuid.UUID, adminID string) (*models.Hospital, string, error) {
	var hospital models.Hospital

	// Find hospital
	if err := database.DB.First(&hospital, "id = ?", hospitalID).Error; err != nil {
		return nil, "", fmt.Errorf("hospital not found: %w", err)
	}

	// Verify status
	if hospital.Status != models.HospitalStatusPendingApproval {
		return nil, "", fmt.Errorf("hospital is not in pending approval status")
	}

	// Generate credentials
	clientID, clientSecret, hashedSecret, err := s.authService.GenerateCredentials()
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate credentials: %w", err)
	}

	// Create Nessie namespace
	namespace := fmt.Sprintf("hospital_%s", hospital.ID.String())
	if err := s.nessieService.CreateNamespace(namespace); err != nil {
		logrus.WithError(err).Warn("Failed to create Nessie namespace, continuing anyway")
		// Don't fail the approval if Nessie is unavailable
	}

	// RabbitMQ queue provisioning removed — nodes fetch requests via HTTP REST
	// queueName := fmt.Sprintf("hospital.%s.requests", hospital.ID.String())
	// if err := s.rabbitMQ.ProvisionHospitalQueue(queueName); err != nil {
	// 	return nil, "", fmt.Errorf("failed to provision RabbitMQ queue: %w", err)
	// }
	queueName := fmt.Sprintf("hospital.%s.requests", hospital.ID.String())

	// Update hospital record
	hospital.Status = models.HospitalStatusCredentialsIssued
	hospital.ClientID = &clientID
	hospital.ClientSecret = &hashedSecret
	hospital.NessieNamespace = &namespace
	hospital.QueueName = &queueName

	if err := database.DB.Save(&hospital).Error; err != nil {
		return nil, "", fmt.Errorf("failed to update hospital: %w", err)
	}

	// Audit log
	s.auditService.Log("hospital", hospital.ID.String(), "approve", adminID, models.JSONB{
		"namespace":  namespace,
		"queue_name": queueName,
	})

	logrus.WithFields(logrus.Fields{
		"hospital_id": hospital.ID,
		"namespace":   namespace,
		"queue_name":  queueName,
	}).Info("Hospital approved successfully")

	// Return plain-text client_secret (ONLY TIME IT'S RETURNED)
	return &hospital, clientSecret, nil
}

// ApproveHospitalWithoutCredentials approves a hospital but doesn't generate credentials yet
// Hospital must generate credentials themselves after logging in
// However, we DO generate the client_id here (one-time, permanent identifier)
func (s *HospitalService) ApproveHospitalWithoutCredentials(hospitalID uuid.UUID, adminID string) (*models.Hospital, error) {
	var hospital models.Hospital

	// Find hospital
	if err := database.DB.First(&hospital, "id = ?", hospitalID).Error; err != nil {
		return nil, fmt.Errorf("hospital not found: %w", err)
	}

	// Verify status
	if hospital.Status != models.HospitalStatusPendingApproval {
		return nil, fmt.Errorf("hospital is not in pending approval status")
	}

	// Generate client_id (one-time, permanent identifier)
	clientID := uuid.New().String()

	// Create Nessie namespace
	namespace := fmt.Sprintf("hospital_%s", hospital.ID.String())
	if err := s.nessieService.CreateNamespace(namespace); err != nil {
		logrus.WithError(err).Warn("Failed to create Nessie namespace, continuing anyway")
	}

	// RabbitMQ queue provisioning removed — nodes fetch requests via HTTP REST
	queueName := fmt.Sprintf("hospital.%s.requests", hospital.ID.String())
	// if s.rabbitMQ != nil {
	// 	if err := s.rabbitMQ.ProvisionHospitalQueue(queueName); err != nil {
	// 		logrus.WithError(err).Warn("Failed to provision RabbitMQ queue, continuing anyway")
	// 	}
	// } else {
	// 	logrus.Warn("RabbitMQ service not initialized, skipping queue provisioning")
	// }

	// Update hospital status to ACTIVE (with client_id, but no secret yet)
	hospital.Status = models.HospitalStatusCredentialsIssued
	hospital.ClientID = &clientID // Set client_id here - it's permanent
	hospital.NessieNamespace = &namespace
	hospital.QueueName = &queueName

	if err := database.DB.Save(&hospital).Error; err != nil {
		return nil, fmt.Errorf("failed to update hospital: %w", err)
	}

	// Audit log
	s.auditService.Log("hospital", hospital.ID.String(), "approve", adminID, models.JSONB{
		"namespace":  namespace,
		"queue_name": queueName,
		"client_id":  clientID,
	})

	logrus.WithFields(logrus.Fields{
		"hospital_id": hospital.ID,
		"namespace":   namespace,
		"queue_name":  queueName,
		"client_id":   clientID,
	}).Info("Hospital approved with client_id - waiting for secret generation")

	return &hospital, nil
}

// GenerateClientCredentials generates a new client_secret for a hospital
// The client_id remains the same (generated at approval time)
// This can be called by the hospital after login with password verification
func (s *HospitalService) GenerateClientCredentials(hospitalID uuid.UUID) (string, string, error) {
	var hospital models.Hospital

	// Find hospital
	if err := database.DB.First(&hospital, "id = ?", hospitalID).Error; err != nil {
		return "", "", fmt.Errorf("hospital not found: %w", err)
	}

	// Verify hospital is approved/active
	if hospital.Status != models.HospitalStatusActive && hospital.Status != models.HospitalStatusCredentialsIssued {
		return "", "", fmt.Errorf("hospital must be approved before generating credentials")
	}

	// Verify client_id exists (should be set at approval time)
	if hospital.ClientID == nil || *hospital.ClientID == "" {
		return "", "", fmt.Errorf("hospital does not have a client_id - contact administrator")
	}

	// Generate ONLY client_secret (client_id stays the same)
	secretBytes := make([]byte, 32)
	if _, err := rand.Read(secretBytes); err != nil {
		return "", "", fmt.Errorf("failed to generate client secret: %w", err)
	}
	clientSecret := base64.URLEncoding.EncodeToString(secretBytes)

	hashedSecret, err := bcrypt.GenerateFromPassword([]byte(clientSecret), bcrypt.DefaultCost)
	if err != nil {
		return "", "", fmt.Errorf("failed to hash secret: %w", err)
	}
	hashedSecretStr := string(hashedSecret)

	// Update hospital record with new secret
	hospital.ClientSecret = &hashedSecretStr
	hospital.Status = models.HospitalStatusCredentialsIssued

	if err := database.DB.Save(&hospital).Error; err != nil {
		return "", "", fmt.Errorf("failed to update hospital: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"hospital_id": hospital.ID,
		"client_id":   *hospital.ClientID,
	}).Info("Client secret generated for hospital (client_id unchanged)")

	// Return client_id (unchanged) and new client_secret (ONLY TIME client_secret IS RETURNED)
	return *hospital.ClientID, clientSecret, nil
}

// RejectHospital rejects a pending hospital registration
func (s *HospitalService) RejectHospital(hospitalID uuid.UUID, adminID, reason string) error {
	var hospital models.Hospital

	if err := database.DB.First(&hospital, "id = ?", hospitalID).Error; err != nil {
		return fmt.Errorf("hospital not found: %w", err)
	}

	if hospital.Status != models.HospitalStatusPendingApproval {
		return fmt.Errorf("hospital is not in pending approval status")
	}

	hospital.Status = models.HospitalStatusRejected

	if err := database.DB.Save(&hospital).Error; err != nil {
		return fmt.Errorf("failed to update hospital: %w", err)
	}

	// Audit log
	s.auditService.Log("hospital", hospital.ID.String(), "reject", adminID, models.JSONB{
		"reason": reason,
	})

	logrus.WithFields(logrus.Fields{
		"hospital_id": hospital.ID,
		"reason":      reason,
	}).Info("Hospital registration rejected")

	return nil
}

// Handshake handles the node handshake after credential issuance
func (s *HospitalService) Handshake(hospital *models.Hospital, minioEndpoint string, capabilities, metadata map[string]interface{}) (map[string]interface{}, error) {
	// Update hospital with node information
	hospital.MinIOEndpoint = &minioEndpoint
	hospital.Status = models.HospitalStatusActive

	if capabilities != nil {
		capJSON, _ := json.Marshal(capabilities)
		hospital.Capabilities = models.JSONB(capabilities)
		_ = json.Unmarshal(capJSON, &hospital.Capabilities)
	}

	if metadata != nil {
		metaJSON, _ := json.Marshal(metadata)
		hospital.Metadata = models.JSONB(metadata)
		_ = json.Unmarshal(metaJSON, &hospital.Metadata)
	}

	now := database.DB.NowFunc()
	hospital.HandshakeAt = &now

	if err := database.DB.Save(hospital).Error; err != nil {
		return nil, fmt.Errorf("failed to update hospital: %w", err)
	}

	// Audit log
	s.auditService.Log("hospital", hospital.ID.String(), "handshake", hospital.ID.String(), models.JSONB{
		"minio_endpoint": minioEndpoint,
	})

	// Return configuration for the node
	config := map[string]interface{}{
		"nessie_endpoint":   s.cfg.Nessie.Endpoint,
		"nessie_namespace":  hospital.NessieNamespace,
		"nessie_branch":     s.cfg.Nessie.DefaultBranch,
		"queue_name":        hospital.QueueName,
		"rabbitmq_endpoint": s.cfg.RabbitMQ.GetAMQPURL(),
		"central_api_base":  fmt.Sprintf("http://localhost:%d/api/v1", s.cfg.App.Port), // TODO: Make this configurable
		"hospital_id":       hospital.ID.String(),
	}

	logrus.WithFields(logrus.Fields{
		"hospital_id":    hospital.ID,
		"minio_endpoint": minioEndpoint,
	}).Info("Hospital handshake completed")

	return config, nil
}

// UpdateMinIOEndpoint updates the MinIO endpoint for a hospital
func (s *HospitalService) UpdateMinIOEndpoint(hospitalID uuid.UUID, endpoint string) (*models.Hospital, error) {
	var hospital models.Hospital

	if err := database.DB.First(&hospital, "id = ?", hospitalID).Error; err != nil {
		return nil, fmt.Errorf("hospital not found: %w", err)
	}

	hospital.MinIOEndpoint = &endpoint
	if err := database.DB.Save(&hospital).Error; err != nil {
		return nil, fmt.Errorf("failed to update hospital: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"hospital_id":    hospital.ID,
		"minio_endpoint": endpoint,
	}).Info("Hospital data lake endpoint updated")

	return &hospital, nil
}

// GetPendingRegistrations returns all pending hospital registrations
func (s *HospitalService) GetPendingRegistrations() ([]models.Hospital, error) {
	var hospitals []models.Hospital

	if err := database.DB.Where("status = ?", models.HospitalStatusPendingApproval).
		Order("created_at DESC").
		Find(&hospitals).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch pending registrations: %w", err)
	}

	return hospitals, nil
}

// GetHospitalByID retrieves a hospital by ID
func (s *HospitalService) GetHospitalByID(id uuid.UUID) (*models.Hospital, error) {
	var hospital models.Hospital

	if err := database.DB.First(&hospital, "id = ?", id).Error; err != nil {
		return nil, fmt.Errorf("hospital not found: %w", err)
	}

	return &hospital, nil
}

// GetAllHospitals retrieves all hospitals with optional status filter
func (s *HospitalService) GetAllHospitals(status string) ([]models.Hospital, error) {
	var hospitals []models.Hospital
	query := database.DB

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Order("created_at DESC").Find(&hospitals).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch hospitals: %w", err)
	}

	return hospitals, nil
}

// GetActiveHospitals returns all active hospitals
func (s *HospitalService) GetActiveHospitals() ([]models.Hospital, error) {
	return s.GetAllHospitals(models.HospitalStatusActive)
}

// NotifyNodeBackend sends handshake data to the node-backend
func (s *HospitalService) NotifyNodeBackend(nodeBackendURL, clientID, clientSecret string, hospital *models.Hospital) error {
	// Prepare handshake payload
	payload := map[string]interface{}{
		"client_id":        clientID,
		"client_secret":    clientSecret,
		"queue_name":       hospital.QueueName,
		"nessie_namespace": hospital.NessieNamespace,
		"minio_endpoint":   hospital.MinIOEndpoint,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		logrus.Errorf("Failed to marshal handshake payload: %v", err)
		return err
	}

	// Send POST request to node-backend's /api/v1/handshake endpoint
	url := fmt.Sprintf("%s/api/v1/handshake", nodeBackendURL)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		logrus.Errorf("Failed to notify node-backend at %s: %v", url, err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		logrus.Errorf("Node-backend handshake failed with status %d", resp.StatusCode)
		return fmt.Errorf("node-backend handshake failed with status: %d", resp.StatusCode)
	}

	logrus.Infof("Successfully notified node-backend at %s", url)
	return nil
}
