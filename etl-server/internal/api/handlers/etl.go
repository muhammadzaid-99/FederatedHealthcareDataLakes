package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/etl-server/internal/executor"
	"github.com/hms-fyp/etl-server/internal/models"
	"github.com/sirupsen/logrus"
)

// ETLHandler handles HTTP requests for ETL job operations
type ETLHandler struct {
	executor *executor.Executor
}

// NewETLHandler creates a new ETLHandler
func NewETLHandler(exec *executor.Executor) *ETLHandler {
	return &ETLHandler{executor: exec}
}

// RunJob triggers a new ETL job
// POST /api/v1/jobs
func (h *ETLHandler) RunJob(c *gin.Context) {
	var req models.JobRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	logrus.WithFields(logrus.Fields{
		"db_host":          req.DBHost,
		"db_name":          req.DBName,
		"minio_endpoint":   req.MinioEndpoint,
		"nessie_namespace": req.NessieNamespace,
	}).Info("ETL job requested")

	jobID := h.executor.SubmitJob(&req)

	c.JSON(http.StatusAccepted, gin.H{
		"message": "ETL job started",
		"job_id":  jobID,
	})
}

// GetJob returns the status and details of a job by ID
// GET /api/v1/jobs/:id
func (h *ETLHandler) GetJob(c *gin.Context) {
	jobID := c.Param("id")
	if jobID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Job ID is required"})
		return
	}

	job := h.executor.GetJob(jobID)
	if job == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"job": job})
}

// TestConnection tests database connectivity
// POST /api/v1/test-connection
func (h *ETLHandler) TestConnection(c *gin.Context) {
	var req models.TestConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	logrus.WithFields(logrus.Fields{
		"db_host": req.DBHost,
		"db_port": req.DBPort,
		"db_name": req.DBName,
		"db_user": req.DBUser,
	}).Info("Testing database connection")

	if err := h.executor.TestConnection(&req); err != nil {
		logrus.WithError(err).Warn("Connection test failed")
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	logrus.Info("Connection test successful")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Connection successful",
	})
}
