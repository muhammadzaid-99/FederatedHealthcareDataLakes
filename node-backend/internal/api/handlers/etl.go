package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/hms-fyp/node-backend/internal/services"
)

type ETLHandler struct {
	etlService *services.ETLService
}

func NewETLHandler(etlService *services.ETLService) *ETLHandler {
	return &ETLHandler{
		etlService: etlService,
	}
}

// SaveConfig handles saving ETL configuration
// POST /api/v1/etl/config
func (h *ETLHandler) SaveConfig(c *gin.Context) {
	var req models.ETLConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Validate required fields
	if req.DBHost == "" || req.DBPort == 0 || req.DBName == "" || req.DBUser == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required database fields"})
		return
	}

	if req.MinioEndpoint == "" || req.MinioAccessKey == "" || req.MinioBucket == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required MinIO fields"})
		return
	}

	if req.PythonPath == "" || req.ScriptsPath == "" || req.JDBCPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required path fields"})
		return
	}

	// Save configuration
	if err := h.etlService.SaveConfig(&req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save configuration", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ETL configuration saved successfully",
		"config":  req,
	})
}

// GetConfig retrieves the current ETL configuration
// GET /api/v1/etl/config
func (h *ETLHandler) GetConfig(c *gin.Context) {
	config, err := h.etlService.GetConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get configuration", "details": err.Error()})
		return
	}

	if config == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ETL not configured yet"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"config": config,
	})
}

// TestConnection tests database connectivity
// POST /api/v1/etl/test-connection
func (h *ETLHandler) TestConnection(c *gin.Context) {
	var req models.ETLConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Test connection
	if err := h.etlService.TestConnection(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Connection successful",
	})
}

// StartScheduler starts the ETL scheduler
// POST /api/v1/etl/scheduler/start
func (h *ETLHandler) StartScheduler(c *gin.Context) {
	if err := h.etlService.StartScheduler(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to start scheduler", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ETL scheduler started successfully",
	})
}

// StopScheduler stops the ETL scheduler
// POST /api/v1/etl/scheduler/stop
func (h *ETLHandler) StopScheduler(c *gin.Context) {
	if err := h.etlService.StopScheduler(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to stop scheduler", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ETL scheduler stopped successfully",
	})
}

// GetSchedulerStatus returns the current scheduler status
// GET /api/v1/etl/scheduler/status
func (h *ETLHandler) GetSchedulerStatus(c *gin.Context) {
	status := h.etlService.GetSchedulerStatus()
	c.JSON(http.StatusOK, status)
}

// RunJob manually triggers an ETL job
// POST /api/v1/etl/jobs/run
func (h *ETLHandler) RunJob(c *gin.Context) {
	// Get config
	config, err := h.etlService.GetConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get configuration", "details": err.Error()})
		return
	}

	if config == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ETL not configured yet"})
		return
	}

	// Run job asynchronously
	go func() {
		if err := h.etlService.RunJob(config.ID); err != nil {
			// Log error but don't return it since this is async
			// The job status will reflect the error
			println("ETL job failed:", err.Error())
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "ETL job started",
	})
}

// GetJobs retrieves ETL job history
// GET /api/v1/etl/jobs?limit=10&offset=0
func (h *ETLHandler) GetJobs(c *gin.Context) {
	// Parse pagination parameters
	limitStr := c.DefaultQuery("limit", "10")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 10
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	// Get jobs
	jobs, total, err := h.etlService.GetJobs(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get jobs", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"jobs":   jobs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GetJob retrieves a single job by ID
// GET /api/v1/etl/jobs/:id
func (h *ETLHandler) GetJob(c *gin.Context) {
	idStr := c.Param("id")
	jobID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid job ID"})
		return
	}

	job, err := h.etlService.GetJob(jobID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get job", "details": err.Error()})
		return
	}

	if job == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"job": job,
	})
}
