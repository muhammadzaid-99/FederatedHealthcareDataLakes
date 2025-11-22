package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/services"
)

type HospitalHandler struct {
	hospitalService *services.HospitalService
	auditService    *services.AuditService
}

func NewHospitalHandler(hospitalService *services.HospitalService, auditService *services.AuditService) *HospitalHandler {
	return &HospitalHandler{
		hospitalService: hospitalService,
		auditService:    auditService,
	}
}

// RegisterHospital handles hospital registration requests
func (h *HospitalHandler) RegisterHospital(c *gin.Context) {
	var req struct {
		Name     string `json:"name" binding:"required"`
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hospital, err := h.hospitalService.RegisterHospital(req.Name, req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Registration submitted successfully. Awaiting admin approval.",
		"hospital": gin.H{
			"id":     hospital.ID,
			"name":   hospital.Name,
			"email":  hospital.AdminEmail,
			"status": hospital.Status,
		},
	})
}

// GetPendingRegistrations returns all pending hospital registrations (admin only)
func (h *HospitalHandler) GetPendingRegistrations(c *gin.Context) {
	hospitals, err := h.hospitalService.GetPendingRegistrations()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch registrations"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"registrations": hospitals,
		"count":         len(hospitals),
	})
}

// ApproveRegistration approves a hospital registration (admin only)
func (h *HospitalHandler) ApproveRegistration(c *gin.Context) {
	hospitalIDStr := c.Param("id")
	hospitalID, err := uuid.Parse(hospitalIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	adminID, _ := c.Get("user_id")

	hospital, clientSecret, err := h.hospitalService.ApproveHospital(hospitalID, adminID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"hospital",
		hospital.ID.String(),
		"approve",
		adminID.(string),
		"admin",
		c.ClientIP(),
		nil,
	)

	// IMPORTANT: This is the ONLY time the plain-text client_secret is returned
	c.JSON(http.StatusOK, gin.H{
		"message": "Hospital approved successfully",
		"hospital": gin.H{
			"id":               hospital.ID,
			"name":             hospital.Name,
			"client_id":        hospital.ClientID,
			"client_secret":    clientSecret, // ONLY RETURNED ONCE
			"nessie_namespace": hospital.NessieNamespace,
			"queue_name":       hospital.QueueName,
		},
		"warning": "Store the client_secret securely. It will not be shown again.",
	})
}

// RejectRegistration rejects a hospital registration (admin only)
func (h *HospitalHandler) RejectRegistration(c *gin.Context) {
	hospitalIDStr := c.Param("id")
	hospitalID, err := uuid.Parse(hospitalIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)

	adminID, _ := c.Get("user_id")

	if err := h.hospitalService.RejectHospital(hospitalID, adminID.(string), req.Reason); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"hospital",
		hospitalID.String(),
		"reject",
		adminID.(string),
		"admin",
		c.ClientIP(),
		nil,
	)

	c.JSON(http.StatusOK, gin.H{"message": "Hospital registration rejected"})
}

// GetAllHospitals returns all hospitals (admin only)
func (h *HospitalHandler) GetAllHospitals(c *gin.Context) {
	status := c.Query("status")

	hospitals, err := h.hospitalService.GetAllHospitals(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch hospitals"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hospitals": hospitals,
		"count":     len(hospitals),
	})
}

// GetHospitalByID returns hospital details
func (h *HospitalHandler) GetHospitalByID(c *gin.Context) {
	hospitalIDStr := c.Param("id")
	hospitalID, err := uuid.Parse(hospitalIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	hospital, err := h.hospitalService.GetHospitalByID(hospitalID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "hospital not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hospital": hospital})
}

// Handshake handles the node handshake after credentials are issued
func (h *HospitalHandler) Handshake(c *gin.Context) {
	var req struct {
		ClientID      string                 `json:"client_id" binding:"required"`
		ClientSecret  string                 `json:"client_secret" binding:"required"`
		MinIOEndpoint string                 `json:"minio_endpoint" binding:"required"`
		Capabilities  map[string]interface{} `json:"capabilities"`
		Metadata      map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate hospital
	authService := c.MustGet("authService").(*services.AuthService)
	hospital, err := authService.AuthenticateHospital(req.ClientID, req.ClientSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Perform handshake
	config, err := h.hospitalService.Handshake(hospital, req.MinIOEndpoint, req.Capabilities, req.Metadata)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Generate JWT for future API calls
	token, err := authService.GenerateJWT(hospital.ID.String(), "hospital", hospital.AdminEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"hospital",
		hospital.ID.String(),
		"handshake",
		hospital.ID.String(),
		"hospital",
		c.ClientIP(),
		nil,
	)

	c.JSON(http.StatusOK, gin.H{
		"message":      "Handshake successful",
		"access_token": token,
		"config":       config,
		"hospital": gin.H{
			"id":     hospital.ID,
			"name":   hospital.Name,
			"status": hospital.Status,
		},
	})
}

// GetNodeStatus returns the status of the authenticated node
func (h *HospitalHandler) GetNodeStatus(c *gin.Context) {
	userID, _ := c.Get("user_id")
	hospitalID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	hospital, err := h.hospitalService.GetHospitalByID(hospitalID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "hospital not found"})
		return
	}

	response := gin.H{
		"id":               hospital.ID,
		"name":             hospital.Name,
		"email":            hospital.AdminEmail,
		"status":           hospital.Status,
		"minio_endpoint":   hospital.MinIOEndpoint,
		"nessie_namespace": hospital.NessieNamespace,
		"queue_name":       hospital.QueueName,
		"capabilities":     hospital.Capabilities,
		"handshake_at":     hospital.HandshakeAt,
		"created_at":       hospital.CreatedAt,
		"updated_at":       hospital.UpdatedAt,
	}

	// Include client_id if credentials are issued or active
	// Note: client_secret is hashed and never returned after initial approval
	if hospital.ClientID != nil {
		response["client_id"] = *hospital.ClientID
	}

	c.JSON(http.StatusOK, gin.H{
		"hospital":  response,
		"timestamp": time.Now(),
	})
}
