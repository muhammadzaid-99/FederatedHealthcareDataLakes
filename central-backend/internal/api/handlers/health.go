package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/services"
)

type HealthHandler struct {
	nessieService   *services.NessieService
	rabbitMQService *services.RabbitMQService
}

func NewHealthHandler(nessieService *services.NessieService, rabbitMQService *services.RabbitMQService) *HealthHandler {
	return &HealthHandler{
		nessieService:   nessieService,
		rabbitMQService: rabbitMQService,
	}
}

// HealthCheck returns the health status of the application and dependencies
func (h *HealthHandler) HealthCheck(c *gin.Context) {
	status := gin.H{
		"status": "healthy",
		"services": gin.H{
			"database": "unknown",
			"nessie":   "unknown",
			"rabbitmq": "unknown",
		},
	}

	healthy := true

	// Check database
	if db := database.GetDB(); db != nil {
		sqlDB, err := db.DB()
		if err == nil && sqlDB.Ping() == nil {
			status["services"].(gin.H)["database"] = "healthy"
		} else {
			status["services"].(gin.H)["database"] = "unhealthy"
			healthy = false
		}
	} else {
		status["services"].(gin.H)["database"] = "unhealthy"
		healthy = false
	}

	// Check Nessie
	if err := h.nessieService.HealthCheck(); err == nil {
		status["services"].(gin.H)["nessie"] = "healthy"
	} else {
		status["services"].(gin.H)["nessie"] = "unhealthy"
		// Don't mark as unhealthy, Nessie is optional
	}

	// Check RabbitMQ
	if err := h.rabbitMQService.HealthCheck(); err == nil {
		status["services"].(gin.H)["rabbitmq"] = "healthy"
	} else {
		status["services"].(gin.H)["rabbitmq"] = "unhealthy"
		healthy = false
	}

	if !healthy {
		status["status"] = "degraded"
		c.JSON(http.StatusServiceUnavailable, status)
		return
	}

	c.JSON(http.StatusOK, status)
}

// ReadinessCheck returns whether the application is ready to serve requests
func (h *HealthHandler) ReadinessCheck(c *gin.Context) {
	// Check database connection
	if db := database.GetDB(); db != nil {
		sqlDB, err := db.DB()
		if err == nil && sqlDB.Ping() == nil {
			c.JSON(http.StatusOK, gin.H{"status": "ready"})
			return
		}
	}

	c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready"})
}

// LivenessCheck returns whether the application is alive
func (h *HealthHandler) LivenessCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "alive"})
}
