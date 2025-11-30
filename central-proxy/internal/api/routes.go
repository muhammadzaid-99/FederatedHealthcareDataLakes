package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-proxy/internal/api/handlers"
	"github.com/hms-fyp/central-proxy/internal/iceberg"
	"github.com/hms-fyp/central-proxy/internal/proxy"
	"github.com/hms-fyp/central-proxy/internal/services"
	"github.com/sirupsen/logrus"
)

// SetupRoutes configures all API routes for the central proxy
func SetupRoutes(
	r *gin.Engine,
	icebergCatalog *iceberg.IcebergCatalog,
	s3Router *proxy.S3DataRouter,
	credService *services.CredentialService,
	trinoService *services.TrinoService,
) {
	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "central-proxy",
		})
	})

	// Ready check endpoint (verifies DB connection)
	r.GET("/ready", func(c *gin.Context) {
		// Could add DB ping here
		c.JSON(http.StatusOK, gin.H{
			"status": "ready",
		})
	})

	// =====================================
	// Iceberg REST Catalog Routes (Hybrid Pointer Implementation)
	// =====================================
	// Uses Nessie /api/v2 for metadata location, injects credentials
	icebergGroup := r.Group("/iceberg")
	icebergCatalog.RegisterRoutes(icebergGroup)

	// =====================================
	// S3 Data Router Routes
	// =====================================
	// Virtual S3 gateway that routes to hospital MinIO instances
	// Re-signs requests with hospital credentials before forwarding
	r.Any("/s3/*path", s3Router.Handle)

	// =====================================
	// Admin/Debug Routes (should be protected in production)
	// =====================================
	admin := r.Group("/admin")
	{
		// List all hospitals and their endpoints
		admin.GET("/hospitals", func(c *gin.Context) {
			hospitals, err := credService.GetAllHospitals()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"hospitals": hospitals})
		})

		// Check credentials for a namespace
		admin.GET("/credentials/:namespace", func(c *gin.Context) {
			namespace := c.Param("namespace")
			creds, err := credService.GetCredentialsByNamespace(namespace)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}

			// Return credential info (redacted for security)
			c.JSON(http.StatusOK, gin.H{
				"namespace":      namespace,
				"access_key_id":  creds.AccessKeyID,
				"has_secret":     creds.SecretAccessKey != "",
				"has_token":      creds.SessionToken != "",
				"minio_endpoint": creds.MinIOEndpoint,
				"expires_at":     creds.Expiration,
				"is_valid":       creds.IsValid(),
			})
		})

		// Invalidate all caches
		admin.POST("/cache/invalidate", func(c *gin.Context) {
			credService.InvalidateCache()
			c.JSON(http.StatusOK, gin.H{"message": "Caches invalidated"})
		})
	}

	// =====================================
	// Trino Query Routes
	// =====================================
	if trinoService != nil {
		trinoHandler := handlers.NewTrinoHandler(trinoService)
		trinoGroup := r.Group("/api/trino")
		{
			// Execute a SQL query
			trinoGroup.POST("/query", trinoHandler.ExecuteQuery)
			// Get all schemas
			trinoGroup.GET("/schemas", trinoHandler.GetSchemas)
			// Get tables in a schema
			trinoGroup.GET("/schemas/:schema/tables", trinoHandler.GetTables)
			// Get columns for a table
			trinoGroup.GET("/schemas/:schema/tables/:table/columns", trinoHandler.GetTableColumns)
		}
	}

	logrus.Info("Routes configured successfully")
}
