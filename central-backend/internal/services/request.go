package services

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/models"
	"github.com/sirupsen/logrus"
)

type RequestService struct {
	rabbitMQ     *RabbitMQService
	auditService *AuditService
}

func NewRequestService(rabbitMQ *RabbitMQService, auditService *AuditService) *RequestService {
	return &RequestService{
		rabbitMQ:     rabbitMQ,
		auditService: auditService,
	}
}

// CreateAccessRequest creates a new data access request and routes it to hospitals
// This is the legacy function for admin-initiated requests
func (s *RequestService) CreateAccessRequest(
	requestorID uuid.UUID,
	requestedNodes []string,
	departments []string,
	purpose string,
	expiresAt time.Time,
) (*models.DataAccessRequest, error) {
	// Validate requested nodes
	if len(requestedNodes) == 0 {
		return nil, fmt.Errorf("at least one hospital node must be requested")
	}

	// Verify hospitals exist and are active
	var hospitals []models.Hospital
	if err := database.DB.Where("id IN ? AND status = ?", requestedNodes, models.HospitalStatusActive).
		Find(&hospitals).Error; err != nil {
		return nil, fmt.Errorf("failed to verify hospitals: %w", err)
	}

	if len(hospitals) != len(requestedNodes) {
		return nil, fmt.Errorf("some requested hospitals are not active or do not exist")
	}

	// Create request
	request := &models.DataAccessRequest{
		RequestorID:    requestorID,
		RequestedNodes: convertToJSONBArray(requestedNodes),
		Departments:    departments,
		Purpose:        purpose,
		Status:         models.RequestStatusPending,
		ExpiresAt:      expiresAt,
	}

	if err := database.DB.Create(request).Error; err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Create response entries for each hospital
	for _, hospital := range hospitals {
		response := &models.NodeAccessResponse{
			RequestID:  request.ID,
			HospitalID: hospital.ID,
			Status:     models.ResponseStatusPending,
		}

		if err := database.DB.Create(response).Error; err != nil {
			logrus.WithError(err).Error("Failed to create node response entry")
			continue
		}
	}

	// Publish request to hospital queues
	if err := s.routeRequestToNodes(request, hospitals); err != nil {
		logrus.WithError(err).Error("Failed to route request to all nodes")
		// Don't fail the request creation, but log the error
	}

	// Update status to forwarded
	request.Status = models.RequestStatusForwarded
	database.DB.Save(request)

	// Audit log
	s.auditService.Log("request", request.ID.String(), "create", requestorID.String(), models.JSONB{
		"hospitals_count": len(requestedNodes),
		"purpose":         purpose,
	})

	logrus.WithFields(logrus.Fields{
		"request_id":      request.ID,
		"requestor":       requestorID,
		"hospitals_count": len(requestedNodes),
	}).Info("Access request created and forwarded")

	return request, nil
}

// routeRequestToNodes publishes the access request to each hospital's queue
func (s *RequestService) routeRequestToNodes(request *models.DataAccessRequest, hospitals []models.Hospital) error {
	// Prepare message payload
	payload := map[string]interface{}{
		"type":         "data_request", // Message type for node-backend processing
		"request_id":   request.ID.String(),
		"requestor_id": request.RequestorID.String(),
		"departments":  request.Departments,
		"purpose":      request.Purpose,
		"expires_at":   request.ExpiresAt,
		"created_at":   request.CreatedAt,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Publish to each hospital's queue
	for _, hospital := range hospitals {
		if err := s.rabbitMQ.PublishAccessRequest(
			hospital.ID.String(),
			request.ID.String(),
			payloadBytes,
		); err != nil {
			logrus.WithFields(logrus.Fields{
				"hospital_id": hospital.ID,
				"request_id":  request.ID,
				"error":       err,
			}).Error("Failed to publish request to hospital queue")
			// Continue to next hospital
		}
	}

	return nil
}

// NodeResponseCredentials contains the STS credentials sent by a hospital node
type NodeResponseCredentials struct {
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	CredExpiration  *time.Time
	Departments     []string
	DateRangeStart  string
	DateRangeEnd    string
	PolicyJSON      string
}

// SubmitNodeResponse handles a hospital node's response to an access request
func (s *RequestService) SubmitNodeResponse(
	requestID, hospitalID uuid.UUID,
	status, presignedURL, notes string,
	validUntil *time.Time,
	creds NodeResponseCredentials,
) (*models.NodeAccessResponse, error) {
	// Find the response entry
	var response models.NodeAccessResponse
	if err := database.DB.Where("request_id = ? AND hospital_id = ?", requestID, hospitalID).
		First(&response).Error; err != nil {
		return nil, fmt.Errorf("response entry not found: %w", err)
	}

	// Validate status
	if status != models.ResponseStatusApproved && status != models.ResponseStatusRejected {
		return nil, fmt.Errorf("invalid response status: %s", status)
	}

	// Update response
	response.Status = status
	response.PresignedURL = presignedURL
	response.Notes = notes
	response.ValidUntil = validUntil
	now := time.Now()
	response.RespondedAt = &now

	// Add credentials if approved
	if status == models.ResponseStatusApproved {
		response.AccessKeyID = creds.AccessKeyID
		response.SecretAccessKey = creds.SecretAccessKey
		response.SessionToken = creds.SessionToken
		response.CredExpiration = creds.CredExpiration
		response.Departments = creds.Departments
		response.DateRangeStart = creds.DateRangeStart
		response.DateRangeEnd = creds.DateRangeEnd
		response.PolicyJSON = creds.PolicyJSON
	}

	if err := database.DB.Save(&response).Error; err != nil {
		return nil, fmt.Errorf("failed to update response: %w", err)
	}

	// Update request status
	if err := s.updateRequestStatus(requestID); err != nil {
		logrus.WithError(err).Warn("Failed to update request status")
	}

	// Audit log
	s.auditService.Log("response", response.ID.String(), "submit", hospitalID.String(), models.JSONB{
		"request_id": requestID.String(),
		"status":     status,
	})

	logrus.WithFields(logrus.Fields{
		"request_id":  requestID,
		"hospital_id": hospitalID,
		"status":      status,
	}).Info("Node response submitted")

	return &response, nil
}

// updateRequestStatus updates the overall request status based on node responses
func (s *RequestService) updateRequestStatus(requestID uuid.UUID) error {
	var request models.DataAccessRequest
	if err := database.DB.Preload("Responses").First(&request, "id = ?", requestID).Error; err != nil {
		return err
	}

	totalResponses := len(request.Responses)
	approvedCount := 0
	rejectedCount := 0
	pendingCount := 0

	for _, response := range request.Responses {
		switch response.Status {
		case models.ResponseStatusApproved:
			approvedCount++
		case models.ResponseStatusRejected:
			rejectedCount++
		case models.ResponseStatusPending:
			pendingCount++
		}
	}

	// Update request status based on responses
	var newStatus string
	if pendingCount == 0 {
		// All responses received
		if approvedCount == totalResponses {
			newStatus = models.RequestStatusApproved
		} else if rejectedCount == totalResponses {
			newStatus = models.RequestStatusRejected
		} else {
			newStatus = models.RequestStatusPartialApproved
		}
	} else if approvedCount > 0 {
		newStatus = models.RequestStatusPartialApproved
	} else {
		newStatus = models.RequestStatusForwarded
	}

	if request.Status != newStatus {
		request.Status = newStatus
		return database.DB.Save(&request).Error
	}

	return nil
}

// GetRequestByID retrieves a request with all responses
func (s *RequestService) GetRequestByID(requestID uuid.UUID) (*models.DataAccessRequest, error) {
	var request models.DataAccessRequest

	if err := database.DB.Preload("Responses.Hospital").
		First(&request, "id = ?", requestID).Error; err != nil {
		return nil, fmt.Errorf("request not found: %w", err)
	}

	return &request, nil
}

// GetRequests retrieves requests with optional filters
func (s *RequestService) GetRequests(requestorID, status string, limit, offset int) ([]models.DataAccessRequest, int64, error) {
	var requests []models.DataAccessRequest
	var total int64

	query := database.DB.Model(&models.DataAccessRequest{})

	if requestorID != "" {
		query = query.Where("requestor_id = ?", requestorID)
	}

	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count requests: %w", err)
	}

	// Get paginated results
	if err := query.Preload("Responses").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&requests).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to fetch requests: %w", err)
	}

	return requests, total, nil
}

// Helper function to convert to JSONB
func convertToJSONB(data interface{}) models.JSONB {
	jsonData, _ := json.Marshal(data)
	var result models.JSONB
	_ = json.Unmarshal(jsonData, &result)
	return result
}

// Helper function to convert to JSONBArray
func convertToJSONBArray(data []string) models.JSONBArray {
	result := make(models.JSONBArray, len(data))
	for i, v := range data {
		result[i] = v
	}
	return result
}

// ============================================================
// REQUESTOR-SPECIFIC METHODS
// ============================================================

// GetRequestorByID retrieves a requestor by their ID
func (s *RequestService) GetRequestorByID(requestorID uuid.UUID) (*models.Requestor, error) {
	var requestor models.Requestor
	if err := database.DB.First(&requestor, "id = ?", requestorID).Error; err != nil {
		return nil, fmt.Errorf("requestor not found: %w", err)
	}
	return &requestor, nil
}

// GetRequestsByRequestorID retrieves all requests for a specific requestor
func (s *RequestService) GetRequestsByRequestorID(requestorID uuid.UUID, status string, limit, offset int) ([]models.DataAccessRequest, int64, error) {
	var requests []models.DataAccessRequest
	var total int64

	query := database.DB.Model(&models.DataAccessRequest{}).Where("requestor_id = ?", requestorID)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count requests: %w", err)
	}

	// Get paginated results with responses
	if err := query.Preload("Responses.Hospital").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&requests).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to fetch requests: %w", err)
	}

	return requests, total, nil
}

// CreateRequestorAccessRequest creates a new data access request for a requestor
func (s *RequestService) CreateRequestorAccessRequest(
	requestorID uuid.UUID,
	requestedNodes []string,
	departments []string,
	purpose string,
	expiresAt time.Time,
) (*models.DataAccessRequest, error) {
	// Validate requested nodes
	if len(requestedNodes) == 0 {
		return nil, fmt.Errorf("at least one hospital node must be requested")
	}

	// Get requestor for email (for queue message)
	var requestor models.Requestor
	if err := database.DB.First(&requestor, "id = ?", requestorID).Error; err != nil {
		return nil, fmt.Errorf("requestor not found: %w", err)
	}

	// Verify hospitals exist and are active
	var hospitals []models.Hospital
	if err := database.DB.Where("id IN ? AND status = ?", requestedNodes, models.HospitalStatusActive).
		Find(&hospitals).Error; err != nil {
		return nil, fmt.Errorf("failed to verify hospitals: %w", err)
	}

	if len(hospitals) != len(requestedNodes) {
		return nil, fmt.Errorf("some requested hospitals are not active or do not exist")
	}

	// Create request
	request := &models.DataAccessRequest{
		RequestorID:    requestorID,
		RequestedNodes: convertToJSONBArray(requestedNodes),
		Departments:    departments,
		Purpose:        purpose,
		Status:         models.RequestStatusPending,
		ExpiresAt:      expiresAt,
	}

	if err := database.DB.Create(request).Error; err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Create response entries for each hospital
	for _, hospital := range hospitals {
		response := &models.NodeAccessResponse{
			RequestID:  request.ID,
			HospitalID: hospital.ID,
			Status:     models.ResponseStatusPending,
		}

		if err := database.DB.Create(response).Error; err != nil {
			logrus.WithError(err).Error("Failed to create node response entry")
			continue
		}
	}

	// Publish request to hospital queues
	if err := s.routeRequestorRequestToNodes(request, hospitals, &requestor); err != nil {
		logrus.WithError(err).Error("Failed to route request to all nodes")
	}

	// Update status to forwarded
	request.Status = models.RequestStatusForwarded
	database.DB.Save(request)

	// Audit log
	s.auditService.Log("request", request.ID.String(), "create", requestorID.String(), models.JSONB{
		"hospitals_count": len(requestedNodes),
		"purpose":         purpose,
		"departments":     departments,
	})

	logrus.WithFields(logrus.Fields{
		"request_id":      request.ID,
		"requestor_id":    requestorID,
		"hospitals_count": len(requestedNodes),
	}).Info("Access request created and forwarded")

	return request, nil
}

// routeRequestorRequestToNodes publishes the access request to each hospital's queue
func (s *RequestService) routeRequestorRequestToNodes(request *models.DataAccessRequest, hospitals []models.Hospital, requestor *models.Requestor) error {
	// Prepare message payload
	payload := map[string]interface{}{
		"type":            "data_request",
		"request_id":      request.ID.String(),
		"requestor_id":    request.RequestorID.String(),
		"requestor_email": requestor.Email,
		"requestor_name":  requestor.Name,
		"requestor_org":   requestor.Organization,
		"departments":     request.Departments,
		"purpose":         request.Purpose,
		"expires_at":      request.ExpiresAt,
		"created_at":      request.CreatedAt,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Publish to each hospital's queue
	for _, hospital := range hospitals {
		if err := s.rabbitMQ.PublishAccessRequest(
			hospital.ID.String(),
			request.ID.String(),
			payloadBytes,
		); err != nil {
			logrus.WithFields(logrus.Fields{
				"hospital_id": hospital.ID,
				"request_id":  request.ID,
				"error":       err,
			}).Error("Failed to publish request to hospital queue")
		}
	}

	return nil
}

// GetRequestByIDForRequestor retrieves a request ensuring it belongs to the requestor
func (s *RequestService) GetRequestByIDForRequestor(requestID, requestorID uuid.UUID) (*models.DataAccessRequest, error) {
	var request models.DataAccessRequest

	if err := database.DB.Preload("Responses.Hospital").Preload("Requestor").
		First(&request, "id = ? AND requestor_id = ?", requestID, requestorID).Error; err != nil {
		return nil, fmt.Errorf("request not found: %w", err)
	}

	return &request, nil
}

// GetActiveHospitals returns list of active hospitals
func (s *RequestService) GetActiveHospitals() ([]models.Hospital, error) {
	var hospitals []models.Hospital
	if err := database.DB.Where("status = ?", models.HospitalStatusActive).
		Select("id", "name", "admin_email", "status", "created_at").
		Find(&hospitals).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch hospitals: %w", err)
	}
	return hospitals, nil
}
