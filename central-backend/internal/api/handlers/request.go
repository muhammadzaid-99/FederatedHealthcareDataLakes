package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/services"
)

type RequestHandler struct {
	requestService *services.RequestService
	auditService   *services.AuditService
}

func NewRequestHandler(requestService *services.RequestService, auditService *services.AuditService) *RequestHandler {
	return &RequestHandler{
		requestService: requestService,
		auditService:   auditService,
	}
}

// CreateRequest creates a new data access request
func (h *RequestHandler) CreateRequest(c *gin.Context) {
	var req struct {
		RequestorEmail string                 `json:"requestor_email" binding:"required,email"`
		RequestedNodes []string               `json:"requested_nodes" binding:"required,min=1"`
		DataQuery      map[string]interface{} `json:"data_query" binding:"required"`
		Purpose        string                 `json:"purpose" binding:"required"`
		ExpiresIn      int                    `json:"expires_in"` // days, default 30
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get requestor ID from context (if authenticated) or use email
	requestorID := req.RequestorEmail
	if userID, exists := c.Get("user_id"); exists {
		requestorID = userID.(string)
	}

	// Set expiration
	expiresIn := req.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 30 // default 30 days
	}
	expiresAt := time.Now().Add(time.Duration(expiresIn) * 24 * time.Hour)

	// Create request
	request, err := h.requestService.CreateAccessRequest(
		requestorID,
		req.RequestorEmail,
		req.RequestedNodes,
		req.DataQuery,
		req.Purpose,
		expiresAt,
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"request",
		request.ID.String(),
		"create",
		requestorID,
		"user",
		c.ClientIP(),
		nil,
	)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Access request created and forwarded to hospitals",
		"request": request,
	})
}

// GetRequest retrieves a specific request
func (h *RequestHandler) GetRequest(c *gin.Context) {
	requestIDStr := c.Param("id")
	requestID, err := uuid.Parse(requestIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request ID"})
		return
	}

	request, err := h.requestService.GetRequestByID(requestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"request": request})
}

// ListRequests lists all requests with optional filters
func (h *RequestHandler) ListRequests(c *gin.Context) {
	requestorID := c.Query("requestor_id")
	status := c.Query("status")

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 100 {
		limit = 100 // max limit
	}

	requests, total, err := h.requestService.GetRequests(requestorID, status, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// SubmitResponse handles hospital node's response to an access request
func (h *RequestHandler) SubmitResponse(c *gin.Context) {
	requestIDStr := c.Param("id")
	requestID, err := uuid.Parse(requestIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request ID"})
		return
	}

	var req struct {
		Status       string `json:"status" binding:"required,oneof=APPROVED REJECTED"`
		PresignedURL string `json:"presigned_url"`
		Notes        string `json:"notes"`
		ValidHours   int    `json:"valid_hours"` // hours the presigned URL is valid

		// STS Credentials
		AccessKeyID     string `json:"access_key_id"`
		SecretAccessKey string `json:"secret_access_key"`
		SessionToken    string `json:"session_token"`
		CredExpiration  string `json:"cred_expiration"` // ISO8601 timestamp

		// Date range for approved access
		DateRangeStart string `json:"date_range_start"`
		DateRangeEnd   string `json:"date_range_end"`

		// IAM Policy
		PolicyJSON string `json:"policy_json"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get hospital ID from authenticated user
	userID, _ := c.Get("user_id")
	hospitalID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	// Calculate valid until time
	var validUntil *time.Time
	if req.Status == "APPROVED" && req.ValidHours > 0 {
		t := time.Now().Add(time.Duration(req.ValidHours) * time.Hour)
		validUntil = &t
	}

	// Parse credential expiration
	var credExpiration *time.Time
	if req.CredExpiration != "" {
		if t, err := time.Parse(time.RFC3339, req.CredExpiration); err == nil {
			credExpiration = &t
		}
	}

	// Submit response with credentials
	response, err := h.requestService.SubmitNodeResponse(
		requestID,
		hospitalID,
		req.Status,
		req.PresignedURL,
		req.Notes,
		validUntil,
		services.NodeResponseCredentials{
			AccessKeyID:     req.AccessKeyID,
			SecretAccessKey: req.SecretAccessKey,
			SessionToken:    req.SessionToken,
			CredExpiration:  credExpiration,
			DateRangeStart:  req.DateRangeStart,
			DateRangeEnd:    req.DateRangeEnd,
			PolicyJSON:      req.PolicyJSON,
		},
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"response",
		response.ID.String(),
		"submit",
		hospitalID.String(),
		"hospital",
		c.ClientIP(),
		nil,
	)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Response submitted successfully",
		"response": response,
	})
}
