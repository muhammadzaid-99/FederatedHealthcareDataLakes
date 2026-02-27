package handlers

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hms-fyp/node-backend/internal/services"
	"github.com/hms-fyp/node-backend/internal/sts"
)

type DataRequestHandler struct {
	service *services.DataRequestService
}

func NewDataRequestHandler(service *services.DataRequestService) *DataRequestHandler {
	return &DataRequestHandler{
		service: service,
	}
}

// ListRequests handles GET /api/v1/data-requests
func (h *DataRequestHandler) ListRequests(c *gin.Context) {
	status := c.Query("status") // Optional filter: pending, approved, rejected

	// Sync requests from central backend on demand (replaces RabbitMQ consumer)
	if err := h.service.SyncRequestsFromCentral(); err != nil {
		// Log but don't fail — we can still show locally cached requests
		log.Printf("[DataRequestHandler] Warning: failed to sync from central: %v", err)
	}

	requests, err := h.service.ListRequests(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list requests", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": requests,
		"count":    len(requests),
	})
}

// GetRequest handles GET /api/v1/data-requests/:id
func (h *DataRequestHandler) GetRequest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request ID"})
		return
	}

	request, err := h.service.GetRequest(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
		return
	}

	c.JSON(http.StatusOK, request)
}

// ApproveRequest handles POST /api/v1/data-requests/:id/approve
func (h *DataRequestHandler) ApproveRequest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request ID"})
		return
	}

	var input struct {
		ApprovedBy      string   `json:"approved_by" binding:"required"`
		Departments     []string `json:"departments" binding:"required"`      // Departments to grant access to
		DateRangeStart  string   `json:"date_range_start" binding:"required"` // YYYY-MM-DD
		DateRangeEnd    string   `json:"date_range_end" binding:"required"`   // YYYY-MM-DD
		DurationSeconds int32    `json:"duration_seconds"`                    // Optional, defaults to 3600
		Notes           string   `json:"notes"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	approvalInput := services.ApprovalInput{
		RequestID:       id,
		ApprovedBy:      input.ApprovedBy,
		Departments:     input.Departments,
		DateRangeStart:  input.DateRangeStart,
		DateRangeEnd:    input.DateRangeEnd,
		DurationSeconds: input.DurationSeconds,
		Notes:           input.Notes,
	}

	request, err := h.service.ApproveRequest(approvalInput)
	if err != nil {
		// Return 400 for policy-too-large so the UI can show a helpful message
		if errors.Is(err, sts.ErrPolicyTooLarge) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Policy too large for the selected date range. " +
					"Try selecting complete months instead of individual dates, or reduce the number of departments/dates.",
				"code": "POLICY_TOO_LARGE",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve request", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Request approved successfully",
		"request": request,
	})
}

// RejectRequest handles POST /api/v1/data-requests/:id/reject
func (h *DataRequestHandler) RejectRequest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request ID"})
		return
	}

	var input struct {
		RejectedBy string `json:"rejected_by" binding:"required"`
		Notes      string `json:"notes"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	rejectionInput := services.RejectionInput{
		RequestID:  id,
		RejectedBy: input.RejectedBy,
		Notes:      input.Notes,
	}

	request, err := h.service.RejectRequest(rejectionInput)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject request", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Request rejected successfully",
		"request": request,
	})
}
