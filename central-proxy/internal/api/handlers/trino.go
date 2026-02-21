package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-proxy/internal/services"
	"github.com/sirupsen/logrus"
)

// TrinoHandler handles Trino query requests
type TrinoHandler struct {
	trinoService *services.TrinoService
}

// NewTrinoHandler creates a new Trino handler
func NewTrinoHandler(trinoService *services.TrinoService) *TrinoHandler {
	return &TrinoHandler{
		trinoService: trinoService,
	}
}

// ExecuteQuery executes a SQL query
func (h *TrinoHandler) ExecuteQuery(c *gin.Context) {
	var req struct {
		Query string `json:"query" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query is required"})
		return
	}

	logrus.Info("Query request: ", req.Query)

	result, err := h.trinoService.ExecuteQuery(req.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetSchemas returns all available schemas
func (h *TrinoHandler) GetSchemas(c *gin.Context) {
	schemas, err := h.trinoService.GetSchemas()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schemas)
}

// GetTables returns all tables in a schema
func (h *TrinoHandler) GetTables(c *gin.Context) {
	schema := c.Param("schema")
	if schema == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Schema is required"})
		return
	}

	tables, err := h.trinoService.GetTables(schema)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tables)
}

// GetTableColumns returns columns for a table
func (h *TrinoHandler) GetTableColumns(c *gin.Context) {
	schema := c.Param("schema")
	table := c.Param("table")

	if schema == "" || table == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Schema and table are required"})
		return
	}

	columns, err := h.trinoService.GetTableColumns(schema, table)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"schema":  schema,
		"table":   table,
		"columns": columns,
	})
}
