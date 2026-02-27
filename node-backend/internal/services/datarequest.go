package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/hms-fyp/node-backend/internal/sts"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

type DataRequestService struct {
	db                *gorm.DB
	stsConfig         sts.STSConfig
	centralAPIService *CentralAPIService
}

func NewDataRequestService(db *gorm.DB, minioEndpoint, minioAccessKey, minioSecretKey string, centralAPI *CentralAPIService) *DataRequestService {
	return &DataRequestService{
		db: db,
		stsConfig: sts.STSConfig{
			MinioEndpoint: minioEndpoint,
			AccessKey:     minioAccessKey,
			SecretKey:     minioSecretKey,
		},
		centralAPIService: centralAPI,
	}
}

// ListRequests returns all data requests, optionally filtered by status
func (s *DataRequestService) ListRequests(status string) ([]models.DataRequest, error) {
	var requests []models.DataRequest
	query := s.db.Order("created_at DESC")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Find(&requests).Error; err != nil {
		return nil, fmt.Errorf("failed to list requests: %w", err)
	}

	return requests, nil
}

// SyncRequestsFromCentral fetches pending data access requests from the central backend
// via HTTP and creates local DataRequest records for any that don't already exist.
// This replaces the RabbitMQ consumer for receiving new data access requests.
func (s *DataRequestService) SyncRequestsFromCentral() error {
	if s.centralAPIService == nil {
		return fmt.Errorf("central API service not configured")
	}

	centralRequests, err := s.centralAPIService.FetchPendingRequests()
	if err != nil {
		return fmt.Errorf("failed to fetch requests from central: %w", err)
	}

	newCount := 0
	for _, cr := range centralRequests {
		// Check if we already have this request stored locally (by matching request_id in payload)
		var existing models.DataRequest
		err := s.db.Where("request_payload LIKE ?", "%\"request_id\":\""+cr.RequestID+"\"%").First(&existing).Error
		if err == nil {
			// Already exists locally, skip
			continue
		}

		// Build the payload JSON (same format as the old RabbitMQ message)
		payload := map[string]interface{}{
			"type":            cr.Type,
			"request_id":      cr.RequestID,
			"requestor_id":    cr.RequestorID,
			"requestor_email": cr.RequestorEmail,
			"requestor_name":  cr.RequestorName,
			"requestor_org":   cr.RequestorOrg,
			"departments":     cr.Departments,
			"purpose":         cr.Purpose,
			"expires_at":      cr.ExpiresAt,
			"created_at":      cr.CreatedAt,
		}
		payloadBytes, _ := json.Marshal(payload)

		// Create DataRequest record (skip creating Message record — not needed for HTTP flow)
		dataRequest := models.DataRequest{
			MessageID:      uuid.Nil,
			RequestorID:    cr.RequestorID,
			RequestType:    "data_access",
			Status:         "pending",
			RequestPayload: string(payloadBytes),
		}

		if err := s.db.Create(&dataRequest).Error; err != nil {
			logrus.WithError(err).Errorf("Failed to create DataRequest for central request %s", cr.RequestID)
			continue
		}

		newCount++
		logrus.WithFields(logrus.Fields{
			"data_request_id":    dataRequest.ID,
			"central_request_id": cr.RequestID,
			"requestor_id":       cr.RequestorID,
		}).Info("DataRequest created from central HTTP fetch")
	}

	logrus.WithFields(logrus.Fields{
		"fetched": len(centralRequests),
		"new":     newCount,
	}).Info("Sync from central backend completed")

	return nil
}

// GetRequest retrieves a single data request by ID
func (s *DataRequestService) GetRequest(id uuid.UUID) (*models.DataRequest, error) {
	var request models.DataRequest
	if err := s.db.Where("id = ?", id).First(&request).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("request not found")
		}
		return nil, fmt.Errorf("failed to get request: %w", err)
	}
	return &request, nil
}

// CreateRequest creates a new data request from a message
func (s *DataRequestService) CreateRequest(messageID uuid.UUID, requestorID, requestType, payload string) (*models.DataRequest, error) {
	request := &models.DataRequest{
		MessageID:      messageID,
		RequestorID:    requestorID,
		RequestType:    requestType,
		Status:         "pending",
		RequestPayload: payload,
	}

	if err := s.db.Create(request).Error; err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	log.Printf("[DataRequest] Created new request %s from message %s", request.ID, messageID)
	return request, nil
}

// ApproveRequest approves a data request and generates temporary credentials
type ApprovalInput struct {
	RequestID       uuid.UUID
	ApprovedBy      string
	Departments     []string // Departments to grant access to
	DateRangeStart  string   // YYYY-MM-DD
	DateRangeEnd    string   // YYYY-MM-DD
	DurationSeconds int32    // Credential validity duration
	Notes           string
}

func (s *DataRequestService) ApproveRequest(input ApprovalInput) (*models.DataRequest, error) {
	// Get the request
	request, err := s.GetRequest(input.RequestID)
	if err != nil {
		return nil, err
	}

	if request.Status != "pending" {
		return nil, fmt.Errorf("request is not pending (current status: %s)", request.Status)
	}

	// Validate date range
	if input.DateRangeStart == "" || input.DateRangeEnd == "" {
		return nil, fmt.Errorf("date range is required")
	}

	// Get node configuration for namespace and MinIO settings
	var nodeConfig models.NodeConfig
	if err := s.db.First(&nodeConfig).Error; err != nil {
		return nil, fmt.Errorf("failed to get node config: %w", err)
	}

	// Get ETL config for MinIO bucket
	var etlConfig models.ETLConfig
	if err := s.db.First(&etlConfig).Error; err != nil {
		return nil, fmt.Errorf("failed to get ETL config: %w", err)
	}

	bucket := etlConfig.MinioBucket
	namespace := nodeConfig.NessieNamespace
	tablePattern := "checkups_*" // Default table pattern

	// Generate date list
	dates, err := sts.GenerateDateRange(input.DateRangeStart, input.DateRangeEnd)
	if err != nil {
		return nil, fmt.Errorf("failed to generate date range: %w", err)
	}

	// Optimize dates (use wildcards when possible)
	optimizedDates := sts.OptimizeDateRange(dates)

	log.Printf("[DataRequest] Generating credentials for %d dates (optimized to %d patterns)",
		len(dates), len(optimizedDates))

	// Create STS client
	stsClient, err := sts.NewSTSClient(s.stsConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create STS client: %w", err)
	}

	// Set default duration if not provided
	if input.DurationSeconds <= 0 {
		input.DurationSeconds = 3600 // 1 hour
	}

	// Generate temporary credentials with policy
	ctx := context.Background()
	creds, policyJSON, err := sts.GenerateRestrictedKeysForIceberg(
		ctx,
		stsClient,
		bucket,
		namespace,
		tablePattern,
		input.Departments,
		optimizedDates,
		input.DurationSeconds,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate credentials: %w", err)
	}

	// Convert credentials to JSON
	credsJSON, err := json.Marshal(creds)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal credentials: %w", err)
	}

	// Update request
	now := time.Now()
	request.Status = "approved"
	request.ApprovedAt = &now
	request.ApprovedBy = input.ApprovedBy
	request.Departments = input.Departments
	request.DateRangeStart = input.DateRangeStart
	request.DateRangeEnd = input.DateRangeEnd
	request.PolicyJSON = policyJSON
	request.CredentialsJSON = string(credsJSON)
	request.Notes = input.Notes

	if err := s.db.Save(request).Error; err != nil {
		return nil, fmt.Errorf("failed to update request: %w", err)
	}

	log.Printf("[DataRequest] Approved request %s by %s", request.ID, input.ApprovedBy)

	// Send approval to central-backend
	if s.centralAPIService != nil {
		// Parse credential expiration time
		expTime, _ := time.Parse(time.RFC3339, creds.Expiration)
		centralCreds := &Credentials{
			AccessKeyID:     creds.AccessKeyID,
			SecretAccessKey: creds.SecretAccessKey,
			SessionToken:    creds.SessionToken,
			Expiration:      expTime,
		}
		if err := s.centralAPIService.SubmitDataRequestResponse(request, centralCreds); err != nil {
			log.Printf("[DataRequest] Warning: Failed to notify central-backend: %v", err)
			// Don't fail the approval - central can be notified later
		}
	}

	return request, nil
}

// RejectRequest rejects a data request
type RejectionInput struct {
	RequestID  uuid.UUID
	RejectedBy string
	Notes      string
}

func (s *DataRequestService) RejectRequest(input RejectionInput) (*models.DataRequest, error) {
	// Get the request
	request, err := s.GetRequest(input.RequestID)
	if err != nil {
		return nil, err
	}

	if request.Status != "pending" {
		return nil, fmt.Errorf("request is not pending (current status: %s)", request.Status)
	}

	// Update request
	now := time.Now()
	request.Status = "rejected"
	request.RejectedAt = &now
	request.RejectedBy = input.RejectedBy
	request.Notes = input.Notes

	if err := s.db.Save(request).Error; err != nil {
		return nil, fmt.Errorf("failed to update request: %w", err)
	}

	log.Printf("[DataRequest] Rejected request %s by %s", request.ID, input.RejectedBy)

	// Send rejection to central-backend
	if s.centralAPIService != nil {
		if err := s.centralAPIService.SubmitDataRequestResponse(request, nil); err != nil {
			log.Printf("[DataRequest] Warning: Failed to notify central-backend: %v", err)
			// Don't fail the rejection - central can be notified later
		}
	}

	return request, nil
}
