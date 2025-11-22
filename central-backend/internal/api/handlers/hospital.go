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
// NOTE: This no longer generates client_secret - hospital must generate it themselves after login
func (h *HospitalHandler) ApproveRegistration(c *gin.Context) {
	hospitalIDStr := c.Param("id")
	hospitalID, err := uuid.Parse(hospitalIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	adminID, _ := c.Get("user_id")

	hospital, err := h.hospitalService.ApproveHospitalWithoutCredentials(hospitalID, adminID.(string))
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

	c.JSON(http.StatusOK, gin.H{
		"message": "Hospital approved successfully. Hospital can now login and generate their client secret.",
		"hospital": gin.H{
			"id":               hospital.ID,
			"name":             hospital.Name,
			"status":           hospital.Status,
			"nessie_namespace": hospital.NessieNamespace,
			"queue_name":       hospital.QueueName,
		},
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

	// Generate JWT for future API calls with user_type="node"
	token, err := authService.GenerateJWT(hospital.ID.String(), "node", hospital.AdminEmail)
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
		"node",
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

// GetNodeStatus returns the status of the authenticated node (external system)
// Used by node-web after authentication with client credentials
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
		"node":      response,
		"timestamp": time.Now(),
	})
}

// GetHospitalStatus returns the status of the authenticated hospital (central portal user)
// Used by central-web hospital dashboard
func (h *HospitalHandler) GetHospitalStatus(c *gin.Context) {
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
		"nessie_namespace": hospital.NessieNamespace,
		"queue_name":       hospital.QueueName,
		"created_at":       hospital.CreatedAt,
		"updated_at":       hospital.UpdatedAt,
	}

	// Include client_id if credentials are issued
	if hospital.ClientID != nil {
		response["client_id"] = *hospital.ClientID
	}

	c.JSON(http.StatusOK, gin.H{
		"hospital":  response,
		"timestamp": time.Now(),
	})
}

// GenerateClientSecret generates client credentials for an approved hospital
// Requires password verification - this is the ONLY time client_secret is shown
func (h *HospitalHandler) GenerateClientSecret(c *gin.Context) {
	userID, _ := c.Get("user_id")
	hospitalID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid hospital ID"})
		return
	}

	var req struct {
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password is required"})
		return
	}

	// Verify password first
	authService := c.MustGet("authService").(*services.AuthService)
	hospital, err := h.hospitalService.GetHospitalByID(hospitalID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "hospital not found"})
		return
	}

	// Authenticate using email and password
	_, err = authService.AuthenticateHospitalByEmail(hospital.AdminEmail, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}

	// Generate new credentials
	clientID, clientSecret, err := h.hospitalService.GenerateClientCredentials(hospitalID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"hospital",
		hospital.ID.String(),
		"generate_credentials",
		hospitalID.String(),
		"hospital",
		c.ClientIP(),
		nil,
	)

	// Return credentials along with queue info for node-backend setup
	c.JSON(http.StatusOK, gin.H{
		"message":          "Client credentials generated successfully. Use these in your node backend to complete handshake.",
		"client_id":        clientID,
		"client_secret":    clientSecret, // ONLY SHOWN ONCE
		"queue_name":       hospital.QueueName,
		"nessie_namespace": hospital.NessieNamespace,
	})
}
