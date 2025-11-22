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
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("hospital_token", "", -1, "/", "", false, true)

	// Set admin token in httpOnly cookie (secure for central-web)
	// Note: For localhost cross-origin, SameSite=Lax works. For production HTTPS use SameSite=None with Secure=true
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"admin_token", // name
		token,         // value
		3600*24*7,     // maxAge (7 days in seconds)
		"/",           // path
		"",            // domain - empty for same-site across ports
		false,         // secure (set true in production with HTTPS)
		true,          // httpOnly (prevents JavaScript access)
	)

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
	// Clear the cookie
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"admin_token",
		"",
		-1, // maxAge -1 deletes the cookie
		"/",
		"",
		false,
		true,
	)

	c.JSON(http.StatusOK, gin.H{
		"message": "Logout successful",
	})
}

// HospitalLogout handles hospital logout
func (h *AuthHandler) HospitalLogout(c *gin.Context) {
	// Clear the cookie
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"hospital_token",
		"",
		-1, // maxAge -1 deletes the cookie
		"/",
		"",
		false,
		true,
	)

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
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("admin_token", "", -1, "/", "", false, true)

	// Set hospital token in httpOnly cookie (secure for central-web)
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		"hospital_token", // name
		token,            // value
		3600*24*7,        // maxAge (7 days in seconds)
		"/",              // path
		"",               // domain - empty for same-site across ports
		false,            // secure (set true in production with HTTPS)
		true,             // httpOnly (prevents JavaScript access)
	)

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
