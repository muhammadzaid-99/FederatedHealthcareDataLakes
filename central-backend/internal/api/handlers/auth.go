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

// isSecureRequest returns true when the request arrived over HTTPS
// (either directly or proxied through ngrok / a load balancer).
// Secure=true is required for SameSite=None cookies; on plain HTTP
// (localhost dev) it must be false or the browser silently drops the cookie.
func isSecureRequest(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	if c.GetHeader("X-Forwarded-Proto") == "https" {
		return true
	}
	return false
}

// setCookie sets a cookie with the correct SameSite / Secure attributes
// depending on whether the current request is HTTPS.
func setCookie(c *gin.Context, name, value string, maxAge int) {
	secure := isSecureRequest(c)
	if secure {
		// Cross-origin credentialed fetch requires SameSite=None + Secure
		c.SetSameSite(http.SameSiteNoneMode)
	} else {
		// Plain HTTP (local dev) — Lax is fine, Secure must be false
		c.SetSameSite(http.SameSiteLaxMode)
	}
	c.SetCookie(name, value, maxAge, "/", "", secure, true)
}

// AdminLogin handles admin authentication
// This is for the Central-Web admin portal - uses secure httpOnly cookies
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

	// Clear any hospital token cookie first (in case user was logged in as hospital)
	setCookie(c, "hospital_token", "", -1)
	setCookie(c, "admin_token", token, 3600*24*7)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"admin": gin.H{
			"id":       admin.ID,
			"username": admin.Username,
			"email":    admin.Email,
		},
	})
}

// AdminLogout handles admin logout
func (h *AuthHandler) AdminLogout(c *gin.Context) {
	setCookie(c, "admin_token", "", -1)

	c.JSON(http.StatusOK, gin.H{
		"message": "Logout successful",
	})
}

// HospitalLogout handles hospital logout
func (h *AuthHandler) HospitalLogout(c *gin.Context) {
	setCookie(c, "hospital_token", "", -1)

	c.JSON(http.StatusOK, gin.H{
		"message": "Logout successful",
	})
}

// HospitalLogin handles hospital authentication via email/password
// This is for the Central-Web portal - uses secure httpOnly cookies
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

	// Clear any admin token cookie first (in case user was logged in as admin)
	setCookie(c, "admin_token", "", -1)
	setCookie(c, "hospital_token", token, 3600*24*7)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"hospital": gin.H{
			"id":     hospital.ID,
			"name":   hospital.Name,
			"email":  hospital.AdminEmail,
			"status": hospital.Status,
		},
	})
}

// ClientCredentialsAuth handles authentication via client_id/client_secret
// This is for external nodes - returns JWT token with user_type="node"
func (h *AuthHandler) ClientCredentialsAuth(c *gin.Context) {
	var req struct {
		ClientID     string `json:"client_id" binding:"required"`
		ClientSecret string `json:"client_secret" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate hospital via client credentials
	hospital, err := h.authService.AuthenticateHospital(req.ClientID, req.ClientSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// Generate JWT with user_type="node" (not "hospital")
	// This distinguishes external nodes from hospital portal users
	token, err := h.authService.GenerateJWT(hospital.ID.String(), "node", hospital.AdminEmail)
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

// RequestorRegister handles requestor registration
func (h *AuthHandler) RequestorRegister(c *gin.Context) {
	var req struct {
		Name         string `json:"name" binding:"required"`
		Email        string `json:"email" binding:"required,email"`
		Password     string `json:"password" binding:"required,min=6"`
		Organization string `json:"organization"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Register requestor with pending status
	requestor, err := h.authService.RegisterRequestor(req.Name, req.Email, req.Password, req.Organization)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Registration successful. Please wait for admin approval.",
		"requestor": gin.H{
			"id":           requestor.ID,
			"name":         requestor.Name,
			"email":        requestor.Email,
			"organization": requestor.Organization,
			"status":       requestor.Status,
		},
	})
}

// RequestorLogin handles requestor authentication
// Uses secure httpOnly cookies for central-web
func (h *AuthHandler) RequestorLogin(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate requestor
	requestor, err := h.authService.AuthenticateRequestor(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	// Generate JWT
	token, err := h.authService.GenerateJWT(requestor.ID.String(), "requestor", requestor.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	// Clear any other token cookies first
	setCookie(c, "admin_token", "", -1)
	setCookie(c, "hospital_token", "", -1)
	setCookie(c, "requestor_token", token, 3600*24*7)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"requestor": gin.H{
			"id":           requestor.ID,
			"name":         requestor.Name,
			"email":        requestor.Email,
			"organization": requestor.Organization,
			"status":       requestor.Status,
		},
	})
}

// RequestorLogout handles requestor logout
func (h *AuthHandler) RequestorLogout(c *gin.Context) {
	setCookie(c, "requestor_token", "", -1)

	c.JSON(http.StatusOK, gin.H{
		"message": "Logout successful",
	})
}
