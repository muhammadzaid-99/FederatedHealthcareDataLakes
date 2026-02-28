package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/sirupsen/logrus"
)

// ETLClient communicates with the standalone ETL server
type ETLClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewETLClient creates a new ETLClient
func NewETLClient(cfg *config.ETLServerConfig) *ETLClient {
	return &ETLClient{
		baseURL: cfg.URL,
		apiKey:  cfg.InternalAPIKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ETLJobRequest contains everything the ETL server needs to execute a job
type ETLJobRequest struct {
	DBHost          string `json:"db_host"`
	DBPort          int    `json:"db_port"`
	DBName          string `json:"db_name"`
	DBUser          string `json:"db_user"`
	DBPassword      string `json:"db_password"`
	DBTable         string `json:"db_table"`
	MinioEndpoint   string `json:"minio_endpoint"`
	MinioAccessKey  string `json:"minio_access_key"`
	MinioSecretKey  string `json:"minio_secret_key"`
	MinioBucket     string `json:"minio_bucket"`
	NessieNamespace string `json:"nessie_namespace"`
	PythonPath      string `json:"python_path"`
	ScriptsPath     string `json:"scripts_path"`
	JDBCPath        string `json:"jdbc_path"`
	OutputDir       string `json:"output_dir"`
	DateRangeStart  string `json:"date_range_start"`
	DateRangeEnd    string `json:"date_range_end"`
}

// ETLTestConnectionRequest contains params for testing a database connection
type ETLTestConnectionRequest struct {
	DBHost      string `json:"db_host"`
	DBPort      int    `json:"db_port"`
	DBName      string `json:"db_name"`
	DBUser      string `json:"db_user"`
	DBPassword  string `json:"db_password"`
	PythonPath  string `json:"python_path"`
	ScriptsPath string `json:"scripts_path"`
	JDBCPath    string `json:"jdbc_path"`
}

// RemoteJob represents a job returned by the ETL server
type RemoteJob struct {
	ID               string     `json:"id"`
	Status           string     `json:"status"`
	Stage            string     `json:"stage"`
	Message          string     `json:"message"`
	StartTime        time.Time  `json:"start_time"`
	EndTime          *time.Time `json:"end_time,omitempty"`
	StagingPath      string     `json:"staging_path,omitempty"`
	NormalizedPath   string     `json:"normalized_path,omitempty"`
	ValidatedPath    string     `json:"validated_path,omitempty"`
	RecordsExtracted int        `json:"records_extracted"`
	RecordsValidated int        `json:"records_validated"`
	RecordsFailed    int        `json:"records_failed"`
	DateRangeStart   string     `json:"date_range_start"`
	DateRangeEnd     string     `json:"date_range_end"`
	Logs             string     `json:"logs"`
}

// TriggerJob sends a job request to the ETL server and returns the assigned job ID
func (c *ETLClient) TriggerJob(req *ETLJobRequest) (string, error) {
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal job request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/jobs", c.baseURL)

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("X-Internal-API-Key", c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to reach ETL server: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusAccepted {
		return "", fmt.Errorf("ETL server returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		JobID string `json:"job_id"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse ETL server response: %w", err)
	}

	return result.JobID, nil
}

// GetJob polls the ETL server for job status
func (c *ETLClient) GetJob(jobID string) (*RemoteJob, error) {
	url := fmt.Sprintf("%s/api/v1/jobs/%s", c.baseURL, jobID)

	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	if c.apiKey != "" {
		httpReq.Header.Set("X-Internal-API-Key", c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to reach ETL server: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("job not found on ETL server")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ETL server returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Job RemoteJob `json:"job"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse ETL server response: %w", err)
	}

	return &result.Job, nil
}

// TestConnection delegates connection testing to the ETL server
func (c *ETLClient) TestConnection(req *ETLTestConnectionRequest) (bool, string, error) {
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return false, "", fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/test-connection", c.baseURL)

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return false, "", fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("X-Internal-API-Key", c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return false, "", fmt.Errorf("failed to reach ETL server: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return false, "", fmt.Errorf("ETL server returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return false, "", fmt.Errorf("failed to parse response: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"success": result.Success,
		"message": result.Message,
	}).Debug("ETL server connection test result")

	return result.Success, result.Message, nil
}
