package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/models"
	"github.com/hms-fyp/central-control/internal/services"
)

type RequestorAdminHandler struct {
	authService  *services.AuthService
	auditService *services.AuditService
}

func NewRequestorAdminHandler(authService *services.AuthService, auditService *services.AuditService) *RequestorAdminHandler {
	return &RequestorAdminHandler{
		authService:  authService,
		auditService: auditService,
	}
}

// GetPendingRequestors returns all pending requestor registrations (admin only)
func (h *RequestorAdminHandler) GetPendingRequestors(c *gin.Context) {
	requestors, err := h.authService.GetPendingRequestors()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch pending requestors"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requestors": requestors,
		"count":      len(requestors),
	})
}

// GetAllRequestors returns all requestors with optional status filter (admin only)
func (h *RequestorAdminHandler) GetAllRequestors(c *gin.Context) {
	status := c.Query("status")

	requestors, err := h.authService.GetAllRequestors(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch requestors"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requestors": requestors,
		"count":      len(requestors),
	})
}

// ApproveRequestor approves a pending requestor registration (admin only)
func (h *RequestorAdminHandler) ApproveRequestor(c *gin.Context) {
	requestorIDStr := c.Param("id")
	requestorID, err := uuid.Parse(requestorIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid requestor ID"})
		return
	}

	adminID, _ := c.Get("user_id")

	requestor, err := h.authService.ApproveRequestor(requestorID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"requestor",
		requestor.ID.String(),
		"approve",
		adminID.(string),
		"admin",
		c.ClientIP(),
		nil,
	)

	c.JSON(http.StatusOK, gin.H{
		"message": "Requestor approved successfully. They can now login.",
		"requestor": gin.H{
			"id":           requestor.ID,
			"name":         requestor.Name,
			"email":        requestor.Email,
			"organization": requestor.Organization,
			"status":       requestor.Status,
		},
	})
}

// RejectRequestor rejects a pending requestor registration (admin only)
func (h *RequestorAdminHandler) RejectRequestor(c *gin.Context) {
	requestorIDStr := c.Param("id")
	requestorID, err := uuid.Parse(requestorIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid requestor ID"})
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)

	adminID, _ := c.Get("user_id")

	if err := h.authService.RejectRequestor(requestorID, req.Reason); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"requestor",
		requestorID.String(),
		"reject",
		adminID.(string),
		"admin",
		c.ClientIP(),
		models.JSONB{"reason": req.Reason},
	)

	c.JSON(http.StatusOK, gin.H{
		"message": "Requestor rejected successfully.",
	})
}
