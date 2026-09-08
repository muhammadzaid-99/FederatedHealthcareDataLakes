package executor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/etl-server/internal/models"
	"github.com/sirupsen/logrus"
)

// Executor manages ETL job execution and in-memory state
type Executor struct {
	mu   sync.RWMutex
	jobs map[string]*models.Job
}

const (
	defaultPythonPath  = "/usr/local/bin/python"
	defaultScriptsPath = "/app/scripts"
	defaultJDBCPath    = "/app/postgresql-42.7.7.jar"
	defaultOutputDir   = "/app/parquet"
)

// NewExecutor creates a new Executor
func NewExecutor() *Executor {
	return &Executor{
		jobs: make(map[string]*models.Job),
	}
}

// SubmitJob creates a new job, starts execution asynchronously, and returns the job ID
func (e *Executor) SubmitJob(req *models.JobRequest) string {
	applyJobDefaults(req)
	jobID := uuid.New().String()

	// Determine date range
	start := req.DateRangeStart
	end := req.DateRangeEnd
	if start == "" {
		start = time.Now().Add(-24 * time.Hour).Format(time.RFC3339)
	}
	if end == "" {
		end = time.Now().Format(time.RFC3339)
	}

	job := &models.Job{
		ID:             jobID,
		Status:         "running",
		Stage:          "extraction",
		StartTime:      time.Now(),
		DateRangeStart: start,
		DateRangeEnd:   end,
	}

	e.mu.Lock()
	e.jobs[jobID] = job
	e.mu.Unlock()

	e.appendLog(job, fmt.Sprintf("Job started for date range %s to %s", start, end))

	// Run asynchronously
	go e.executeJob(job, req)

	return jobID
}

// GetJob returns a snapshot of the job by ID
func (e *Executor) GetJob(jobID string) *models.Job {
	e.mu.RLock()
	defer e.mu.RUnlock()
	job, ok := e.jobs[jobID]
	if !ok {
		return nil
	}
	// Return a copy to avoid races
	copy := *job
	return &copy
}

// TestConnection tests database connectivity using PySpark
func (e *Executor) TestConnection(req *models.TestConnectionRequest) error {
	applyTestDefaults(req)
	jdbcURL := fmt.Sprintf("jdbc:postgresql://%s:%d/%s", req.DBHost, req.DBPort, req.DBName)

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

	tmpFile := filepath.Join(req.ScriptsPath, "test_connection.py")
	if err := os.WriteFile(tmpFile, []byte(testScript), 0644); err != nil {
		return fmt.Errorf("failed to write test script: %w", err)
	}
	defer os.Remove(tmpFile)

	cmd := exec.Command(
		req.PythonPath,
		tmpFile,
		jdbcURL,
		req.DBUser,
		req.DBPassword,
		req.JDBCPath,
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("connection test failed: %s", stderr.String())
	}

	var result map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return fmt.Errorf("failed to parse test result: %w", err)
	}

	if result["status"] != "success" {
		return fmt.Errorf("connection test failed: %s", result["message"])
	}

	return nil
}

// executeJob runs the full ETL pipeline synchronously (called in a goroutine)
func (e *Executor) executeJob(job *models.Job, req *models.JobRequest) {
	logrus.WithField("job_id", job.ID).Info("Starting ETL job execution")

	// --- Stage 1: Extraction ---
	e.appendLog(job, "Stage: EXTRACTION - Starting data extraction from database")
	stagingPath, noData, err := e.runExtraction(req, job.DateRangeStart, job.DateRangeEnd)
	if err != nil {
		logrus.WithField("job_id", job.ID).Errorf("Extraction failed: %v", err)
		e.failJob(job, "extraction", err)
		return
	}

	if noData {
		logrus.WithField("job_id", job.ID).Info("No records found in date range")
		e.appendLog(job, "No records found in the specified date range. Job completed successfully.")
		e.completeJob(job)
		return
	}

	e.appendLog(job, fmt.Sprintf("Extraction completed successfully. Staging path: %s", stagingPath))
	e.mu.Lock()
	job.StagingPath = stagingPath
	job.Stage = "normalization"
	e.mu.Unlock()

	// --- Stage 2: Normalization ---
	e.appendLog(job, "Stage: NORMALIZATION - Transforming data to FHIR format")
	normalizedPath, err := e.runNormalization(req, stagingPath)
	if err != nil {
		logrus.WithField("job_id", job.ID).Errorf("Normalization failed: %v", err)
		e.failJob(job, "normalization", err)
		return
	}

	e.appendLog(job, fmt.Sprintf("Normalization completed successfully. Normalized path: %s", normalizedPath))
	e.mu.Lock()
	job.NormalizedPath = normalizedPath
	job.Stage = "validation"
	e.mu.Unlock()

	// --- Stage 3: Validation & Publish ---
	e.appendLog(job, "Stage: VALIDATION - Validating data and publishing to MinIO")
	validatedPath, recordsValidated, recordsFailed, err := e.runValidationAndPublish(req, job.DateRangeStart, job.DateRangeEnd, normalizedPath)
	if err != nil {
		logrus.WithField("job_id", job.ID).Errorf("Validation failed: %v", err)
		e.failJob(job, "validation", err)
		return
	}

	e.appendLog(job, fmt.Sprintf("Validation completed. Records validated: %d, Records failed: %d", recordsValidated, recordsFailed))
	e.appendLog(job, fmt.Sprintf("Validated path: %s", validatedPath))

	e.mu.Lock()
	job.ValidatedPath = validatedPath
	job.RecordsValidated = recordsValidated
	job.RecordsFailed = recordsFailed
	e.mu.Unlock()

	duration := time.Since(job.StartTime)
	e.appendLog(job, fmt.Sprintf("Job completed successfully in %v", duration))
	e.completeJob(job)

	logrus.WithField("job_id", job.ID).Info("ETL job completed successfully")
}

// runExtraction executes the extraction Python script
func (e *Executor) runExtraction(req *models.JobRequest, start, end string) (string, bool, error) {
	scriptPath := filepath.Join(req.ScriptsPath, "extract.py")

	cmd := exec.Command(req.PythonPath, scriptPath, start, end)

	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, fmt.Sprintf("JDBC_URL=jdbc:postgresql://%s:%d/%s", req.DBHost, req.DBPort, req.DBName))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DB_TABLE=%s", req.DBTable))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DB_USER=%s", req.DBUser))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DB_PASSWORD=%s", req.DBPassword))
	cmd.Env = append(cmd.Env, fmt.Sprintf("JDBC_DRIVER_PATH=%s", req.JDBCPath))
	cmd.Env = append(cmd.Env, fmt.Sprintf("OUTPUT_DIR=%s", req.OutputDir))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ENDPOINT=%s", req.MinioEndpoint))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ACCESS_KEY=%s", req.MinioAccessKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_SECRET_KEY=%s", req.MinioSecretKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("BUCKET_NAME=%s", req.MinioBucket))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		logrus.Errorf("[ETL] Extraction script error: %s", err.Error())
		logrus.Errorf("[ETL] Extraction stdout: %s", stdout.String())
		logrus.Errorf("[ETL] Extraction stderr: %s", stderr.String())
		return "", false, fmt.Errorf("extraction failed: %s - stderr: %s - stdout: %s", err.Error(), stderr.String(), stdout.String())
	}

	stdoutStr := stdout.String()
	logrus.Debugf("[ETL] Extraction raw stdout: %s", stdoutStr)
	logrus.Debugf("[ETL] Extraction raw stderr: %s", stderr.String())

	var result map[string]interface{}
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return "", false, fmt.Errorf("failed to parse extraction output: %w - output: %s", err, stdoutStr)
	}

	if success, ok := result["success"].(bool); ok && !success {
		message := result["message"].(string)
		return "", false, fmt.Errorf("extraction script reported failure: %s", message)
	}

	if status, ok := result["status"].(string); ok && status == "OK" {
		if result["staging_path"] == nil {
			return "", true, nil
		}
	}

	stagingPath, ok := result["staging_path"].(string)
	if !ok || stagingPath == "" {
		return "", true, nil
	}

	return stagingPath, false, nil
}

func applyJobDefaults(req *models.JobRequest) {
	req.PythonPath = defaultPythonPath
	req.ScriptsPath = defaultScriptsPath
	req.JDBCPath = defaultJDBCPath
	req.OutputDir = defaultOutputDir
}

func applyTestDefaults(req *models.TestConnectionRequest) {
	req.PythonPath = defaultPythonPath
	req.ScriptsPath = defaultScriptsPath
	req.JDBCPath = defaultJDBCPath
}

// runNormalization executes the normalization Python script
func (e *Executor) runNormalization(req *models.JobRequest, stagingPath string) (string, error) {
	scriptPath := filepath.Join(req.ScriptsPath, "fhir_transform.py")

	normalizedPath := filepath.Join(filepath.Dir(filepath.Dir(stagingPath)), "normalized", filepath.Base(stagingPath))

	cmd := exec.Command(req.PythonPath, scriptPath, stagingPath, normalizedPath)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("normalization failed: %s - %s", err.Error(), stderr.String())
	}

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

// runValidationAndPublish executes the validation and publish Python script
func (e *Executor) runValidationAndPublish(req *models.JobRequest, start, end, normalizedPath string) (string, int, int, error) {
	scriptPath := filepath.Join(req.ScriptsPath, "validate_publish.py")

	validatedPath := filepath.Join(filepath.Dir(filepath.Dir(normalizedPath)), "validated", filepath.Base(normalizedPath))

	cmd := exec.Command(req.PythonPath, scriptPath, start, end, normalizedPath, validatedPath)

	logrus.Debugf("[ETL] Config - NessieNamespace: '%s', MinioBucket: '%s', MinioEndpoint: '%s'",
		req.NessieNamespace, req.MinioBucket, req.MinioEndpoint)

	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, fmt.Sprintf("PYSPARK_PYTHON=%s", req.PythonPath))
	cmd.Env = append(cmd.Env, fmt.Sprintf("PYSPARK_DRIVER_PYTHON=%s", req.PythonPath))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ENDPOINT=%s", req.MinioEndpoint))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_ACCESS_KEY=%s", req.MinioAccessKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("MINIO_SECRET_KEY=%s", req.MinioSecretKey))
	cmd.Env = append(cmd.Env, fmt.Sprintf("BUCKET_NAME=%s", req.MinioBucket))
	cmd.Env = append(cmd.Env, fmt.Sprintf("NESSIE_NAMESPACE=%s", req.NessieNamespace))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", 0, 0, fmt.Errorf("validation failed: %s - %s", err.Error(), stderr.String())
	}

	stdoutStr := stdout.String()
	logrus.Debugf("[ETL] Validation script stdout: %s", stdoutStr)
	logrus.Debugf("[ETL] Validation script stderr: %s", stderr.String())

	// Strip non-JSON prefixes (e.g. Ivy download messages)
	jsonStart := strings.Index(stdoutStr, "{")
	if jsonStart == -1 {
		return "", 0, 0, fmt.Errorf("no JSON output found from validation script")
	}

	jsonStr := stdoutStr[jsonStart:]

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return "", 0, 0, fmt.Errorf("failed to parse validation output: %w", err)
	}

	success, ok := result["success"].(bool)
	if !ok || !success {
		return "", 0, 0, fmt.Errorf("validation reported failure: %v", result["message"])
	}

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

// appendLog adds a timestamped log entry to the job
func (e *Executor) appendLog(job *models.Job, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)
	e.mu.Lock()
	job.Logs += logEntry
	e.mu.Unlock()
}

// completeJob marks a job as completed
func (e *Executor) completeJob(job *models.Job) {
	now := time.Now()
	e.mu.Lock()
	job.Status = "completed"
	job.Stage = "completed"
	job.Message = "Job completed successfully"
	job.EndTime = &now
	e.mu.Unlock()
}

// failJob marks a job as failed
func (e *Executor) failJob(job *models.Job, stage string, err error) {
	now := time.Now()
	e.appendLog(job, fmt.Sprintf("ERROR at stage %s: %v", stage, err))
	e.mu.Lock()
	job.Status = "failed"
	job.Stage = stage
	job.Message = err.Error()
	job.EndTime = &now
	e.mu.Unlock()
}
