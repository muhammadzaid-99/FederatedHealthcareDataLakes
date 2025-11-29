package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/node-backend/internal/models"
	"gorm.io/gorm"
)

type ETLService struct {
	db        *gorm.DB
	mu        sync.Mutex
	isRunning bool
	stopChan  chan bool
	ticker    *time.Ticker
}

func NewETLService(db *gorm.DB) *ETLService {
	return &ETLService{
		db:       db,
		stopChan: make(chan bool),
	}
}

// SaveConfig saves or updates the ETL configuration
func (s *ETLService) SaveConfig(config *models.ETLConfig) error {
	// Check if config already exists
	var existing models.ETLConfig
	result := s.db.First(&existing)

	if result.Error == gorm.ErrRecordNotFound {
		// Create new config
		if err := s.db.Create(config).Error; err != nil {
			return fmt.Errorf("failed to create ETL config: %w", err)
		}
		log.Printf("[ETL] Created new config with ID: %s", config.ID)
	} else {
		// Update existing config
		// Preserve passwords if empty string provided (user didn't change them)
		if config.DBPassword == "" {
			config.DBPassword = existing.DBPassword
		}
		if config.MinioSecretKey == "" {
			config.MinioSecretKey = existing.MinioSecretKey
		}

		config.ID = existing.ID
		config.CreatedAt = existing.CreatedAt

		// Log what we're saving
		log.Printf("[ETL] Updating config %s, DBPassword set: %v, MinioSecretKey set: %v",
			config.ID, config.DBPassword != "", config.MinioSecretKey != "")

		if err := s.db.Save(config).Error; err != nil {
			return fmt.Errorf("failed to update ETL config: %w", err)
		}
		log.Printf("[ETL] Updated config with ID: %s", config.ID)
	}

	return nil
}

// GetConfig retrieves the current ETL configuration
func (s *ETLService) GetConfig() (*models.ETLConfig, error) {
	var config models.ETLConfig
	if err := s.db.First(&config).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // No config yet
		}
		return nil, fmt.Errorf("failed to get ETL config: %w", err)
	}
	return &config, nil
}

// TestConnection tests database connectivity
func (s *ETLService) TestConnection(config *models.ETLConfig) error {
	// Build JDBC URL
	jdbcURL := fmt.Sprintf("jdbc:postgresql://%s:%d/%s", config.DBHost, config.DBPort, config.DBName)

	// Use Python with PySpark to test connection
	testScript := `
import sys
from pyspark.sql import SparkSession

jdbc_url = sys.argv[1]
db_user = sys.argv[2]
db_password = sys.argv[3]
jdbc_path = sys.argv[4]

try:
    spark = SparkSession.builder \
        .appName("ConnectionTest") \
        .config("spark.jars", jdbc_path) \
        .getOrCreate()
    
    # Try to read a simple query
    df = spark.read \
        .format("jdbc") \
        .option("url", jdbc_url) \
        .option("dbtable", "(SELECT 1 AS test) AS t") \
        .option("user", db_user) \
        .option("password", db_password) \
        .option("driver", "org.postgresql.Driver") \
        .load()
    
    if df.count() == 1:
        print('{"status": "success", "message": "Connection successful"}')
    else:
        print('{"status": "error", "message": "Unexpected result"}')
    
    spark.stop()
except Exception as e:
    print('{"status": "error", "message": "' + str(e).replace('"', '\\"') + '"}')
    sys.exit(1)
`

	// Write test script to temp file
	tmpFile := filepath.Join(config.ScriptsPath, "test_connection.py")
	if err := os.WriteFile(tmpFile, []byte(testScript), 0644); err != nil {
		return fmt.Errorf("failed to write test script: %w", err)
	}
	defer os.Remove(tmpFile)

	// Execute test
	cmd := exec.Command(
		config.PythonPath,
		tmpFile,
		jdbcURL,
		config.DBUser,
		config.DBPassword,
		config.JDBCPath,
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("connection test failed: %s", stderr.String())
	}

	// Parse result
	var result map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return fmt.Errorf("failed to parse test result: %w", err)
	}

	if result["status"] != "success" {
		return fmt.Errorf("connection test failed: %s", result["message"])
	}

	return nil
}

// StartScheduler starts the ETL scheduler
func (s *ETLService) StartScheduler() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("scheduler is already running")
	}

	// Get config
	config, err := s.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get ETL config: %w", err)
	}
	if config == nil {
		return fmt.Errorf("ETL not configured")
	}

	if !config.ScheduleEnabled {
		return fmt.Errorf("scheduling is not enabled")
	}

	// Currently only support frequency-based scheduling
	if config.ScheduleType != "frequency" {
		return fmt.Errorf("unsupported schedule type: %s", config.ScheduleType)
	}

	if config.FrequencySeconds <= 0 {
		return fmt.Errorf("invalid frequency: %d", config.FrequencySeconds)
	}

	// Mark as active
	config.IsActive = true
	if err := s.db.Save(config).Error; err != nil {
		return fmt.Errorf("failed to update config: %w", err)
	}

	// Start ticker
	s.ticker = time.NewTicker(time.Duration(config.FrequencySeconds) * time.Second)
	s.isRunning = true

	// Start goroutine
	go s.schedulerLoop(config.ID)

	log.Println("[ETL] Scheduler started with frequency:", config.FrequencySeconds, "seconds")
	return nil
}

// StopScheduler stops the ETL scheduler
func (s *ETLService) StopScheduler() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return fmt.Errorf("scheduler is not running")
	}

	// Stop ticker
	if s.ticker != nil {
		s.ticker.Stop()
	}

	// Signal stop
	s.stopChan <- true
	s.isRunning = false

	// Update config
	var config models.ETLConfig
	if err := s.db.First(&config).Error; err == nil {
		config.IsActive = false
		s.db.Save(&config)
	}

	log.Println("[ETL] Scheduler stopped")
	return nil
}

// schedulerLoop runs the ETL job on schedule
func (s *ETLService) schedulerLoop(configID uuid.UUID) {
	for {
		select {
		case <-s.ticker.C:
			log.Println("[ETL] Triggering scheduled job")
			if err := s.RunJob(configID); err != nil {
				log.Printf("[ETL] Job failed: %v", err)
			}
		case <-s.stopChan:
			log.Println("[ETL] Scheduler loop stopping")
			return
		}
	}
}

// RunJob executes a single ETL job
func (s *ETLService) RunJob(configID uuid.UUID) error {
	// Get config
	var config models.ETLConfig
	if err := s.db.First(&config, "id = ?", configID).Error; err != nil {
		log.Printf("[ETL] Failed to get config: %v", err)
		return fmt.Errorf("failed to get config: %w", err)
	}

	// Determine date range
	var start, end time.Time
	if config.LastRunEnd != nil {
		start = config.LastRunEnd.Add(time.Second)
	} else {
		// First run - use a default start time or config setting
		start = time.Now().Add(-24 * time.Hour) // Last 24 hours
	}
	end = time.Now()

	log.Printf("[ETL] Starting job for config %s, date range: %s to %s", configID, start.Format(time.RFC3339), end.Format(time.RFC3339))
	log.Printf("[ETL] Config: DBHost=%s, DBPort=%d, DBName=%s, DBUser=%s, DBTable=%s, MinioEndpoint=%s, MinioBucket=%s, PythonExecutable=%s, JDBCDriver=%s",
		config.DBHost, config.DBPort, config.DBName, config.DBUser, config.DBTable,
		config.MinioEndpoint, config.MinioBucket, config.PythonPath, config.JDBCPath)

	// Create job record
	job := &models.ETLJob{
		ConfigID:       config.ID,
		StartTime:      time.Now(),
		DateRangeStart: start.Format(time.RFC3339),
		DateRangeEnd:   end.Format(time.RFC3339),
		Status:         "running",
		Stage:          "extraction",
		Logs:           "",
	}

	if err := s.db.Create(job).Error; err != nil {
		log.Printf("[ETL] Failed to create job record: %v", err)
		return fmt.Errorf("failed to create job: %w", err)
	}

	s.appendJobLog(job, fmt.Sprintf("Job started for date range %s to %s", start.Format("2006-01-02"), end.Format("2006-01-02")))

	// Run extraction
	log.Printf("[ETL] Starting extraction from %s to %s", job.DateRangeStart, job.DateRangeEnd)
	s.appendJobLog(job, "Stage: EXTRACTION - Starting data extraction from database")
	stagingPath, noData, err := s.runExtraction(&config, job.DateRangeStart, job.DateRangeEnd)
	if err != nil {
		log.Printf("[ETL] Extraction failed: %v", err)
		s.updateJobError(job, "extraction", err)
		return err
	}

	// Check if no data was found - this is a successful completion, not an error
	if noData {
		log.Printf("[ETL] No records found in date range, completing job successfully")
		s.appendJobLog(job, "No records found in the specified date range. Job completed successfully.")
		now := time.Now()
		job.Status = "completed"
		job.Stage = "completed"
		job.EndTime = &now
		s.db.Save(job)

		// Update last run time
		config.LastRunAt = &now
		config.LastRunEnd = &now
		s.db.Save(&config)

		return nil
	}

	log.Printf("[ETL] Extraction completed, staging path: %s", stagingPath)
	s.appendJobLog(job, fmt.Sprintf("Extraction completed successfully. Staging path: %s", stagingPath))

	job.StagingPath = stagingPath
	job.Stage = "normalization"
	s.db.Save(job)

	// Run normalization
	log.Printf("[ETL] Starting normalization")
	s.appendJobLog(job, "Stage: NORMALIZATION - Transforming data to FHIR format")

	normalizedPath, err := s.runNormalization(&config, stagingPath)
	if err != nil {
		log.Printf("[ETL] Normalization failed: %v", err)
		s.updateJobError(job, "normalization", err)
		return err
	}
	log.Printf("[ETL] Normalization completed, normalized path: %s", normalizedPath)
	s.appendJobLog(job, fmt.Sprintf("Normalization completed successfully. Normalized path: %s", normalizedPath))

	job.NormalizedPath = normalizedPath
	job.Stage = "validation"
	s.db.Save(job)

	// Run validation and publish
	log.Printf("[ETL] Starting validation and publish")
	s.appendJobLog(job, "Stage: VALIDATION - Validating data and publishing to MinIO")

	validatedPath, recordsValidated, recordsFailed, err := s.runValidationAndPublish(&config, job.DateRangeStart, job.DateRangeEnd, normalizedPath)
	if err != nil {
		log.Printf("[ETL] Validation failed: %v", err)
		s.updateJobError(job, "validation", err)
		return err
	}
	log.Printf("[ETL] Validation completed, validated: %d, failed: %d", recordsValidated, recordsFailed)
	s.appendJobLog(job, fmt.Sprintf("Validation completed. Records validated: %d, Records failed: %d", recordsValidated, recordsFailed))
	s.appendJobLog(job, fmt.Sprintf("Validated path: %s", validatedPath))

	job.ValidatedPath = validatedPath
	job.RecordsValidated = recordsValidated
	job.RecordsFailed = recordsFailed
	job.Stage = "completed"
	job.Status = "completed"
	endTime := time.Now()
	job.EndTime = &endTime
	job.Message = "Job completed successfully"
	s.appendJobLog(job, fmt.Sprintf("Job completed successfully in %v", endTime.Sub(job.StartTime)))
	s.db.Save(job)

	// Update config last run
	config.LastRunEnd = &end
	s.db.Save(&config)

	log.Printf("[ETL] Job completed successfully")
	return nil
}

// runExtraction executes the extraction script
// Returns: stagingPath, noData flag, error
func (s *ETLService) runExtraction(config *models.ETLConfig, start, end string) (string, bool, error) {
	scriptPath := filepath.Join(config.ScriptsPath, "extract2.py")

	cmd := exec.Command(config.PythonPath, scriptPath, start, end)

	// Set environment variables
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, fmt.Sprintf("JDBC_URL=jdbc:postgresql://%s:%d/%s", config.DBHost, config.DBPort, config.DBName))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DB_TABLE=%s", config.DBTable))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DB_USER=%s", config.DBUser))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DB_PASSWORD=%s", config.DBPassword))
	cmd.Env = append(cmd.Env, fmt.Sprintf("JDBC_DRIVER_PATH=%s", config.JDBCPath))
	cmd.Env = append(cmd.Env, fmt.Sprintf("OUTPUT_DIR=%s", config.OutputDir))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ENDPOINT=%s", config.MinioEndpoint))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ACCESS_KEY=%s", config.MinioAccessKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_SECRET_KEY=%s", config.MinioSecretKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("BUCKET_NAME=%s", config.MinioBucket))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("[ETL] Extraction script error: %s", err.Error())
		log.Printf("[ETL] Extraction stdout: %s", stdout.String())
		log.Printf("[ETL] Extraction stderr: %s", stderr.String())
		return "", false, fmt.Errorf("extraction failed: %s - stderr: %s - stdout: %s", err.Error(), stderr.String(), stdout.String())
	}

	// Log the raw output for debugging
	stdoutStr := stdout.String()
	log.Printf("[ETL] Extraction raw stdout: %s", stdoutStr)
	log.Printf("[ETL] Extraction raw stderr: %s", stderr.String())

	// Parse output
	var result map[string]interface{}
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return "", false, fmt.Errorf("failed to parse extraction output: %w - output: %s", err, stdoutStr)
	}

	// Check if success field exists and is false
	if success, ok := result["success"].(bool); ok && !success {
		message := result["message"].(string)
		return "", false, fmt.Errorf("extraction script reported failure: %s", message)
	}

	// Check status field
	if status, ok := result["status"].(string); ok && status == "OK" {
		// Check if staging_path is null (no data found)
		if result["staging_path"] == nil {
			return "", true, nil // noData = true
		}
	}

	stagingPath, ok := result["staging_path"].(string)
	if !ok || stagingPath == "" {
		return "", true, nil // noData = true
	}

	return stagingPath, false, nil
}

// runNormalization executes the normalization script
func (s *ETLService) runNormalization(config *models.ETLConfig, stagingPath string) (string, error) {
	scriptPath := filepath.Join(config.ScriptsPath, "fhir_transform.py")

	// Generate normalized path
	normalizedPath := filepath.Join(filepath.Dir(filepath.Dir(stagingPath)), "normalized", filepath.Base(stagingPath))

	cmd := exec.Command(config.PythonPath, scriptPath, stagingPath, normalizedPath)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("normalization failed: %s - %s", err.Error(), stderr.String())
	}

	// Parse output
	var result map[string]interface{}
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return "", fmt.Errorf("failed to parse normalization output: %w", err)
	}

	success, ok := result["success"].(bool)
	if !ok || !success {
		return "", fmt.Errorf("normalization reported failure: %v", result["message"])
	}

	return normalizedPath, nil
}

// runValidationAndPublish executes the validation and publish script
func (s *ETLService) runValidationAndPublish(config *models.ETLConfig, start, end, normalizedPath string) (string, int, int, error) {
	scriptPath := filepath.Join(config.ScriptsPath, "validate_publish.py")

	// Generate validated path
	validatedPath := filepath.Join(filepath.Dir(filepath.Dir(normalizedPath)), "validated", filepath.Base(normalizedPath))

	// Get NessieNamespace from NodeConfig (single source of truth)
	var nodeConfig models.NodeConfig
	if err := s.db.First(&nodeConfig).Error; err != nil {
		return "", 0, 0, fmt.Errorf("failed to get node config for Nessie namespace: %w", err)
	}

	cmd := exec.Command(config.PythonPath, scriptPath, start, end, normalizedPath, validatedPath)

	// Debug: Log the config values
	log.Printf("[ETL] Config - NessieNamespace: '%s', MinioBucket: '%s', MinioEndpoint: '%s'",
		nodeConfig.NessieNamespace, config.MinioBucket, config.MinioEndpoint)

	// Set environment variables
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, fmt.Sprintf("PYSPARK_PYTHON=%s", config.PythonPath))
	cmd.Env = append(cmd.Env, fmt.Sprintf("PYSPARK_DRIVER_PYTHON=%s", config.PythonPath))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ENDPOINT=%s", config.MinioEndpoint))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ACCESS_KEY=%s", config.MinioAccessKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_SECRET_KEY=%s", config.MinioSecretKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("BUCKET_NAME=%s", config.MinioBucket))
	cmd.Env = append(cmd.Env, fmt.Sprintf("NESSIE_NAMESPACE=%s", nodeConfig.NessieNamespace))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", 0, 0, fmt.Errorf("validation failed: %s - %s", err.Error(), stderr.String())
	}

	// Debug: Log what we received
	stdoutStr := stdout.String()
	maxLen := 500
	if len(stdoutStr) < maxLen {
		maxLen = len(stdoutStr)
	}
	log.Printf("[ETL] Validation script stdout: %s", stdoutStr)
	log.Printf("[ETL] Validation script stderr: %s", stderr.String())

	// Strip Ivy messages from stdout (they appear before JSON)
	// Find the first '{' character which starts the JSON
	jsonStart := strings.Index(stdoutStr, "{")
	if jsonStart == -1 {
		log.Printf("[ETL] No JSON found in stdout. Raw output: %s", stdoutStr[:maxLen])
		return "", 0, 0, fmt.Errorf("no JSON output found from validation script")
	}

	// Extract just the JSON part
	jsonStr := stdoutStr[jsonStart:]

	// Parse output
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		log.Printf("[ETL] Failed to parse JSON. Raw JSON (first %d chars): %s", maxLen, jsonStr[:min(maxLen, len(jsonStr))])
		return "", 0, 0, fmt.Errorf("failed to parse validation output: %w", err)
	}

	success, ok := result["success"].(bool)
	if !ok || !success {
		return "", 0, 0, fmt.Errorf("validation reported failure: %v", result["message"])
	}

	// Extract record counts if available
	recordsValidated := 0
	recordsFailed := 0
	if val, ok := result["records_validated"].(float64); ok {
		recordsValidated = int(val)
	}
	if val, ok := result["records_failed"].(float64); ok {
		recordsFailed = int(val)
	}

	return validatedPath, recordsValidated, recordsFailed, nil
}

// appendJobLog adds a timestamped log entry to the job
func (s *ETLService) appendJobLog(job *models.ETLJob, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)
	job.Logs += logEntry
	s.db.Save(job)
}

// updateJobError updates job with error status
func (s *ETLService) updateJobError(job *models.ETLJob, stage string, err error) {
	log.Printf("[ETL] Job %s failed at stage %s: %v", job.ID, stage, err)
	s.appendJobLog(job, fmt.Sprintf("ERROR at stage %s: %v", stage, err))
	job.Status = "failed"
	job.Stage = stage
	job.Message = err.Error()
	endTime := time.Now()
	job.EndTime = &endTime
	if err := s.db.Save(job).Error; err != nil {
		log.Printf("[ETL] Failed to save job error: %v", err)
	}
}

// GetJobs retrieves ETL job history
func (s *ETLService) GetJobs(limit int, offset int) ([]models.ETLJob, int64, error) {
	var jobs []models.ETLJob
	var total int64

	// Get total count
	if err := s.db.Model(&models.ETLJob{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count jobs: %w", err)
	}

	// Get jobs with pagination
	if err := s.db.Order("created_at desc").Limit(limit).Offset(offset).Find(&jobs).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to get jobs: %w", err)
	}

	return jobs, total, nil
}

// GetJob retrieves a single job by ID
func (s *ETLService) GetJob(jobID uuid.UUID) (*models.ETLJob, error) {
	var job models.ETLJob
	if err := s.db.First(&job, "id = ?", jobID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get job: %w", err)
	}
	return &job, nil
}

// GetSchedulerStatus returns the current scheduler status
func (s *ETLService) GetSchedulerStatus() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := map[string]interface{}{
		"is_running": s.isRunning,
	}

	// Get config to show schedule details
	var config models.ETLConfig
	if err := s.db.First(&config).Error; err == nil {
		result["schedule_enabled"] = config.ScheduleEnabled
		result["schedule_type"] = config.ScheduleType
		result["frequency_seconds"] = config.FrequencySeconds
		result["is_active"] = config.IsActive

		if config.LastRunEnd != nil {
			result["last_run"] = config.LastRunEnd.Format(time.RFC3339)
			if s.isRunning && config.FrequencySeconds > 0 {
				nextRun := config.LastRunEnd.Add(time.Duration(config.FrequencySeconds) * time.Second)
				result["next_run"] = nextRun.Format(time.RFC3339)
				result["next_run_in_seconds"] = int(time.Until(nextRun).Seconds())
			}
		}
	}

	return result
}
