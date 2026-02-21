package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/services"
)

// QueryHandler exposes structured, server-side query building to requestors.
type QueryHandler struct {
	queryService *services.QueryBuilderService
	auditService *services.AuditService
}

// NewQueryHandler creates a new QueryHandler.
func NewQueryHandler(queryService *services.QueryBuilderService, auditService *services.AuditService) *QueryHandler {
	return &QueryHandler{
		queryService: queryService,
		auditService: auditService,
	}
}

// ExecuteStructuredQuery validates the caller's access and builds + executes
// a Trino query on their behalf.
func (h *QueryHandler) ExecuteStructuredQuery(c *gin.Context) {
	userID, _ := c.Get("user_id")
	requestorID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid requestor ID"})
		return
	}

	var payload services.QueryPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.queryService.BuildAndExecuteQuery(requestorID, payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Audit log
	h.auditService.LogWithActor(
		"query",
		"structured",
		"execute",
		requestorID.String(),
		"requestor",
		c.ClientIP(),
		nil,
	)

	c.JSON(http.StatusOK, result)
}

// GetApprovedAccess returns all APPROVED access responses for the authenticated
// requestor. The frontend uses this to populate the query builder form.
func (h *QueryHandler) GetApprovedAccess(c *gin.Context) {
	userID, _ := c.Get("user_id")
	requestorID, err := uuid.Parse(userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid requestor ID"})
		return
	}

	responses, err := h.queryService.GetApprovedResponses(requestorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"responses": responses})
}

// GetSchemas proxies schema listing through central-backend so the frontend
// never talks directly to the proxy.
func (h *QueryHandler) GetSchemas(c *gin.Context) {
	data, err := h.queryService.ProxyGetSchemas()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

// GetTables proxies table listing for a schema.
func (h *QueryHandler) GetTables(c *gin.Context) {
	schema := c.Param("schema")
	if schema == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "schema is required"})
		return
	}
	data, err := h.queryService.ProxyGetTables(schema)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

// GetColumns proxies column listing for a table.
func (h *QueryHandler) GetColumns(c *gin.Context) {
	schema := c.Param("schema")
	table := c.Param("table")
	if schema == "" || table == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "schema and table are required"})
		return
	}
	data, err := h.queryService.ProxyGetColumns(schema, table)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}
