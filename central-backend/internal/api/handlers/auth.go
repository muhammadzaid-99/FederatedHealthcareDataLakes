package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-control/internal/services"
)

type AuthHandler struct {
	authService     *services.AuthService
	hospitalService *services.HospitalService
}

func NewAuthHandler(authService *services.AuthService, hospitalService *services.HospitalService) *AuthHandler {
	return &AuthHandler{
		authService:     authService,
		hospitalService: hospitalService,
	}
}

// AdminLogin handles admin authentication
func (h *AuthHandler) AdminLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate admin
	admin, err := h.authService.AuthenticateAdmin(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Generate JWT
	token, err := h.authService.GenerateJWT(admin.ID.String(), "admin", admin.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"admin": gin.H{
			"id":       admin.ID,
			"username": admin.Username,
			"email":    admin.Email,
		},
	})
}

// HospitalLogin handles hospital authentication via email/password
func (h *AuthHandler) HospitalLogin(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate hospital using email/password
	hospital, err := h.authService.AuthenticateHospitalByEmail(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Generate JWT
	token, err := h.authService.GenerateJWT(hospital.ID.String(), "hospital", hospital.AdminEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"hospital": gin.H{
			"id":     hospital.ID,
			"name":   hospital.Name,
			"email":  hospital.AdminEmail,
			"status": hospital.Status,
		},
	})
}

// ClientCredentialsAuth handles authentication via client_id/client_secret
func (h *AuthHandler) ClientCredentialsAuth(c *gin.Context) {
	var req struct {
		ClientID     string `json:"client_id" binding:"required"`
		ClientSecret string `json:"client_secret" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate hospital
	hospital, err := h.authService.AuthenticateHospital(req.ClientID, req.ClientSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Generate JWT
	token, err := h.authService.GenerateJWT(hospital.ID.String(), "hospital", hospital.AdminEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"hospital": gin.H{
			"id":     hospital.ID,
			"name":   hospital.Name,
			"status": hospital.Status,
		},
	})
}
