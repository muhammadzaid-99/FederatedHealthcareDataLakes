package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/database"
	"github.com/hms-fyp/node-backend/internal/models"
)

// TokenService manages access tokens for central-backend communication
type TokenService struct {
	cfg *config.Config
}

func NewTokenService(cfg *config.Config) *TokenService {
	return &TokenService{cfg: cfg}
}

// GetValidAccessToken returns a valid access token, refreshing if necessary
func (s *TokenService) GetValidAccessToken() (string, error) {
	// Get node config from database
	var nodeConfig models.NodeConfig
	if err := database.DB.First(&nodeConfig).Error; err != nil {
		return "", fmt.Errorf("node not configured: %w", err)
	}

	// Check if current token is still valid (with 5 minute buffer)
	if nodeConfig.AccessToken != "" && time.Now().Add(5*time.Minute).Before(nodeConfig.TokenExpiresAt) {
		return nodeConfig.AccessToken, nil
	}

	// Token expired or doesn't exist - get new one
	return s.refreshAccessToken(&nodeConfig)
}

// refreshAccessToken gets a new access token from central-backend
func (s *TokenService) refreshAccessToken(nodeConfig *models.NodeConfig) (string, error) {
	// Prepare request body
	reqBody := map[string]string{
		"client_id":     nodeConfig.ClientID,
		"client_secret": nodeConfig.ClientSecret,
	}

	bodyBytes, _ := json.Marshal(reqBody)

	// Call central-backend token endpoint
	url := fmt.Sprintf("%s/api/v1/auth/node/token", s.cfg.Central.BaseURL)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to request token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request failed with status: %d", resp.StatusCode)
	}

	// Parse response
	var tokenResp struct {
		Token     string `json:"token"`
		ExpiresIn int    `json:"expires_in"` // seconds
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode token response: %w", err)
	}

	// Update node config with new token
	nodeConfig.AccessToken = tokenResp.Token
	nodeConfig.TokenExpiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	if err := database.DB.Save(nodeConfig).Error; err != nil {
		return "", fmt.Errorf("failed to save token: %w", err)
	}

	return tokenResp.Token, nil
}
