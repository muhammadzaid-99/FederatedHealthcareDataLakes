package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/etl-server/internal/api/handlers"
	"github.com/sirupsen/logrus"
)

// InternalAPIKeyMiddleware validates the X-Internal-API-Key header.
// This is the same pattern used in central-proxy to authenticate requests
// from the central-backend. Here it authenticates requests from the node-backend.
func InternalAPIKeyMiddleware(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if apiKey == "" {
			// If no key configured, allow all (development mode)
			c.Next()
			return
		}
		provided := c.GetHeader("X-Internal-API-Key")
		if provided != apiKey {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized: invalid or missing internal API key"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// SetupRoutes configures all API routes for the ETL server
func SetupRoutes(r *gin.Engine, etlHandler *handlers.ETLHandler, internalAPIKey string) {
	// Health check (unauthenticated)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "etl-server",
		})
	})

	// All job endpoints are protected by internal API key
	api := r.Group("/api/v1")
	api.Use(InternalAPIKeyMiddleware(internalAPIKey))
	{
		// Trigger a new ETL job
		api.POST("/jobs", etlHandler.RunJob)

		// Poll job status by ID
		api.GET("/jobs/:id", etlHandler.GetJob)

		// Test database connection
		api.POST("/test-connection", etlHandler.TestConnection)
	}

	logrus.Info("ETL server routes configured successfully")
}
