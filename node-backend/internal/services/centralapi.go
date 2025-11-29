package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/sirupsen/logrus"
)

// CentralAPIService handles communication with central-backend
type CentralAPIService struct {
	cfg          *config.Config
	tokenService *TokenService
}

func NewCentralAPIService(cfg *config.Config, tokenService *TokenService) *CentralAPIService {
	return &CentralAPIService{
		cfg:          cfg,
		tokenService: tokenService,
	}
}

// SubmitResponsePayload is the payload sent to central-backend when responding to a data request
type SubmitResponsePayload struct {
	Status          string `json:"status"` // APPROVED or REJECTED
	Notes           string `json:"notes,omitempty"`
	ValidHours      int    `json:"valid_hours,omitempty"`
	AccessKeyID     string `json:"access_key_id,omitempty"`
	SecretAccessKey string `json:"secret_access_key,omitempty"`
	SessionToken    string `json:"session_token,omitempty"`
	CredExpiration  string `json:"cred_expiration,omitempty"` // ISO8601
	DateRangeStart  string `json:"date_range_start,omitempty"`
	DateRangeEnd    string `json:"date_range_end,omitempty"`
	PolicyJSON      string `json:"policy_json,omitempty"`
}

// SubmitDataRequestResponse sends the approval/rejection response to central-backend
func (s *CentralAPIService) SubmitDataRequestResponse(request *models.DataRequest, creds *Credentials) error {
	// Extract the original request ID from the payload
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(request.RequestPayload), &payload); err != nil {
		return fmt.Errorf("failed to parse request payload: %w", err)
	}

	requestID, ok := payload["request_id"].(string)
	if !ok || requestID == "" {
		return fmt.Errorf("request_id not found in payload")
	}

	// Get access token
	token, err := s.tokenService.GetValidAccessToken()
	if err != nil {
		return fmt.Errorf("failed to get access token: %w", err)
	}

	// Prepare payload
	submitPayload := SubmitResponsePayload{
		Notes: request.Notes,
	}

	if request.Status == "approved" {
		submitPayload.Status = "APPROVED"
		submitPayload.DateRangeStart = request.DateRangeStart
		submitPayload.DateRangeEnd = request.DateRangeEnd
		submitPayload.PolicyJSON = request.PolicyJSON

		// Parse credentials from JSON if available
		if creds != nil {
			submitPayload.AccessKeyID = creds.AccessKeyID
			submitPayload.SecretAccessKey = creds.SecretAccessKey
			submitPayload.SessionToken = creds.SessionToken
			if !creds.Expiration.IsZero() {
				submitPayload.CredExpiration = creds.Expiration.Format(time.RFC3339)
			}
		}

		// Set valid hours based on credential expiration
		if creds != nil && !creds.Expiration.IsZero() {
			hoursUntilExpiry := int(time.Until(creds.Expiration).Hours())
			if hoursUntilExpiry > 0 {
				submitPayload.ValidHours = hoursUntilExpiry
			}
		}
	} else {
		submitPayload.Status = "REJECTED"
	}

	// Send request to central-backend
	url := fmt.Sprintf("%s/api/v1/requests/%s/responses", s.cfg.Central.BaseURL, requestID)

	bodyBytes, err := json.Marshal(submitPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"url":        url,
		"request_id": requestID,
		"status":     submitPayload.Status,
	}).Info("[CentralAPI] Submitting response to central-backend")

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errResp)
		logrus.WithFields(logrus.Fields{
			"status_code": resp.StatusCode,
			"response":    errResp,
		}).Error("[CentralAPI] Failed to submit response")
		return fmt.Errorf("central-backend returned status %d: %v", resp.StatusCode, errResp)
	}

	logrus.WithFields(logrus.Fields{
		"request_id": requestID,
		"status":     submitPayload.Status,
	}).Info("[CentralAPI] Successfully submitted response to central-backend")

	return nil
}

// Credentials represents the STS credentials
type Credentials struct {
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	Expiration      time.Time
}
