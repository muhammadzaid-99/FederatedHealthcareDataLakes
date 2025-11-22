package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-control/internal/services"
)

// AuthMiddleware validates JWT tokens
// For central-web: reads from httpOnly cookies
// For external APIs: reads from Authorization header
func AuthMiddleware(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string
		var authSource string

		// Check Authorization header first (for API clients / node-web)
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			// Extract token from "Bearer <token>"
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
				c.Abort()
				return
			}
			token = parts[1]
			authSource = "bearer_token"
		} else {
			// Try to get token from cookie (for central-web)
			// Check which cookies are present
			adminToken, adminErr := c.Cookie("admin_token")
			hospitalToken, hospitalErr := c.Cookie("hospital_token")

			// Prefer the cookie that matches the route being accessed
			// If both exist, use the one that's newer or matches the expected user type
			if hospitalErr == nil && hospitalToken != "" {
				token = hospitalToken
				authSource = "hospital_cookie"
			} else if adminErr == nil && adminToken != "" {
				token = adminToken
				authSource = "admin_cookie"
			} else {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
				c.Abort()
				return
			}
		}

		// Validate token
		claims, err := authService.ValidateJWT(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		// Set user info in context
		c.Set("user_id", claims.UserID)
		c.Set("user_type", claims.UserType)
		c.Set("email", claims.Email)
		c.Set("auth_source", authSource)

		c.Next()
	}
}

// AdminOnly middleware ensures only admins can access the endpoint
func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		userType, exists := c.Get("user_type")
		if !exists || userType != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// HospitalOnly middleware ensures only hospitals can access the endpoint
func HospitalOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		userType, exists := c.Get("user_type")
		if !exists || userType != "hospital" {
			// Log for debugging
			authSource, _ := c.Get("auth_source")
			c.JSON(http.StatusForbidden, gin.H{
				"error":       "hospital access required",
				"user_type":   userType,
				"exists":      exists,
				"auth_source": authSource,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// NodeOnly middleware ensures only nodes can access the endpoint
func NodeOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		userType, exists := c.Get("user_type")
		if !exists || userType != "node" {
			c.JSON(http.StatusForbidden, gin.H{"error": "node access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
