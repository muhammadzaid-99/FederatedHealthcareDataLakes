package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/database"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/sirupsen/logrus"
)

type NodeHandler struct {
	cfg *config.Config
	// rabbitMQService removed — nodes now fetch requests via HTTP REST
}

func NewNodeHandler(cfg *config.Config) *NodeHandler {
	return &NodeHandler{
		cfg: cfg,
	}
}

// SaveConfig receives configuration from node-web UI
// This is called by hospital admin entering credentials in node-web
func (h *NodeHandler) SaveConfig(c *gin.Context) {
	var req struct {
		ClientID        string `json:"client_id" binding:"required"`
		ClientSecret    string `json:"client_secret" binding:"required"`
		QueueName       string `json:"queue_name"` // No longer required — RabbitMQ removed
		NessieNamespace string `json:"nessie_namespace"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if config already exists
	var existingConfig models.NodeConfig
	err := database.DB.First(&existingConfig).Error

	if err == nil {
		// Config exists - update it
		existingConfig.ClientID = req.ClientID
		existingConfig.ClientSecret = req.ClientSecret
		existingConfig.QueueName = req.QueueName
		existingConfig.NessieNamespace = req.NessieNamespace

		if err := database.DB.Save(&existingConfig).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update configuration"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "configuration updated successfully",
		})
		return
	}

	// Create new config
	nodeConfig := models.NodeConfig{
		ClientID:          req.ClientID,
		ClientSecret:      req.ClientSecret,
		QueueName:         req.QueueName,
		NessieNamespace:   req.NessieNamespace,
		CentralBackendURL: h.cfg.Central.BaseURL,
	}

	if err := database.DB.Create(&nodeConfig).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save configuration"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "configuration saved successfully",
	})
}

// Handshake initiates handshake with central-backend
// This is called after config is saved, to authenticate and get additional details
func (h *NodeHandler) Handshake(c *gin.Context) {
	// Get stored config
	var nodeConfig models.NodeConfig
	if err := database.DB.First(&nodeConfig).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not configured yet. Please save configuration first."})
		return
	}

	// Prepare handshake request to central-backend
	handshakePayload := map[string]interface{}{
		"client_id":      nodeConfig.ClientID,
		"client_secret":  nodeConfig.ClientSecret,
		"minio_endpoint": "http://minio:9000", // TODO: make configurable
		"capabilities": map[string]interface{}{
			"version": "1.0.0",
		},
	}

	payloadBytes, _ := json.Marshal(handshakePayload)

	// Call central-backend handshake endpoint
	url := fmt.Sprintf("%s/api/v1/nodes/handshake", h.cfg.Central.BaseURL)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		logrus.Errorf("Handshake with central failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to connect to central backend"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("handshake failed with status: %d", resp.StatusCode)})
		return
	}

	// Parse response
	var handshakeResp struct {
		Message     string `json:"message"`
		AccessToken string `json:"access_token"`
		Config      struct {
			QueueName       string `json:"queue_name"`
			NessieNamespace string `json:"nessie_namespace"`
		} `json:"config"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&handshakeResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse handshake response"})
		return
	}

	// Update config with response data
	nodeConfig.QueueName = handshakeResp.Config.QueueName
	nodeConfig.NessieNamespace = handshakeResp.Config.NessieNamespace
	nodeConfig.AccessToken = handshakeResp.AccessToken
	// Set token expiry (default 24 hours from now)
	// nodeConfig.TokenExpiresAt = time.Now().Add(24 * time.Hour)

	if err := database.DB.Save(&nodeConfig).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save handshake response"})
		return
	}

	logrus.Info("Handshake with central-backend successful")

	// RabbitMQ listener disabled: nodes now fetch requests on demand via HTTP.
	// Keeping the code commented out for rollback reference.
	/*
		go func() {
			if err := h.rabbitMQService.Connect(h.cfg.RabbitMQ.URL); err != nil {
				logrus.Errorf("Failed to connect to RabbitMQ: %v", err)
				return
			}
			logrus.Info("Connected to RabbitMQ")

			if err := h.rabbitMQService.StartListening(nodeConfig.QueueName); err != nil {
				logrus.Errorf("Failed to start RabbitMQ listener: %v", err)
			}
		}()
	*/

	c.JSON(http.StatusOK, gin.H{
		"message": "handshake successful",
		"config": gin.H{
			"client_id":        nodeConfig.ClientID,
			"queue_name":       nodeConfig.QueueName,
			"nessie_namespace": nodeConfig.NessieNamespace,
		},
	})
}

// GetNodeStatus returns the current node configuration status
func (h *NodeHandler) GetNodeStatus(c *gin.Context) {
	var nodeConfig models.NodeConfig
	if err := database.DB.First(&nodeConfig).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not configured yet"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"config": gin.H{
			"client_id":        nodeConfig.ClientID,
			"queue_name":       nodeConfig.QueueName,
			"nessie_namespace": nodeConfig.NessieNamespace,
			"configured_at":    nodeConfig.CreatedAt,
			"handshake_done":   nodeConfig.AccessToken != "",
		},
	})
}

// RefreshStatus syncs status from central-backend
func (h *NodeHandler) RefreshStatus(c *gin.Context) {
	// Get stored config
	var nodeConfig models.NodeConfig
	if err := database.DB.First(&nodeConfig).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not configured yet"})
		return
	}

	if nodeConfig.AccessToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "handshake not completed. Please complete handshake first."})
		return
	}

	// Call central-backend to get updated status
	url := fmt.Sprintf("%s/api/v1/nodes/me", h.cfg.Central.BaseURL)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", nodeConfig.AccessToken))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to connect to central backend"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("refresh failed with status: %d", resp.StatusCode)})
		return
	}

	// Parse response
	var statusResp struct {
		Config struct {
			QueueName       string `json:"queue_name"`
			NessieNamespace string `json:"nessie_namespace"`
			Status          string `json:"status"`
		} `json:"config"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&statusResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse response"})
		return
	}

	logrus.Info("Status refreshed from central-backend")

	c.JSON(http.StatusOK, gin.H{
		"message": "status refreshed successfully",
		"config":  statusResp.Config,
	})
}

// GetMessages returns stored messages from RabbitMQ
func (h *NodeHandler) GetMessages(c *gin.Context) {
	var messages []models.Message

	// Get query parameters for filtering
	status := c.DefaultQuery("status", "")

	query := database.DB.Order("created_at DESC").Limit(50)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch messages"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
		"count":    len(messages),
	})
}
