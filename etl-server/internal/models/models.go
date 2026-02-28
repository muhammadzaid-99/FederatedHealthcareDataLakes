package models

import (
	"time"
)

// JobRequest contains everything the ETL server needs to execute a job.
// Since this service has no database, the caller must pass all credentials,
// endpoints, connection parameters, and configuration in the request body.
type JobRequest struct {
	// Database Configuration
	DBHost     string `json:"db_host" binding:"required"`
	DBPort     int    `json:"db_port" binding:"required"`
	DBName     string `json:"db_name" binding:"required"`
	DBUser     string `json:"db_user" binding:"required"`
	DBPassword string `json:"db_password" binding:"required"`
	DBTable    string `json:"db_table" binding:"required"`

	// MinIO Configuration
	MinioEndpoint  string `json:"minio_endpoint" binding:"required"`
	MinioAccessKey string `json:"minio_access_key" binding:"required"`
	MinioSecretKey string `json:"minio_secret_key" binding:"required"`
	MinioBucket    string `json:"minio_bucket" binding:"required"`

	// Nessie / Namespace
	NessieNamespace string `json:"nessie_namespace" binding:"required"`

	// Python Environment
	PythonPath  string `json:"python_path" binding:"required"`
	ScriptsPath string `json:"scripts_path" binding:"required"`
	JDBCPath    string `json:"jdbc_path" binding:"required"`

	// Output
	OutputDir string `json:"output_dir"`

	// Date Range (optional — auto-determined if empty)
	DateRangeStart string `json:"date_range_start"`
	DateRangeEnd   string `json:"date_range_end"`
}

// TestConnectionRequest contains params needed to test a database connection
type TestConnectionRequest struct {
	DBHost      string `json:"db_host" binding:"required"`
	DBPort      int    `json:"db_port" binding:"required"`
	DBName      string `json:"db_name" binding:"required"`
	DBUser      string `json:"db_user" binding:"required"`
	DBPassword  string `json:"db_password" binding:"required"`
	PythonPath  string `json:"python_path" binding:"required"`
	ScriptsPath string `json:"scripts_path" binding:"required"`
	JDBCPath    string `json:"jdbc_path" binding:"required"`
}

// Job represents an ETL job tracked in memory
type Job struct {
	ID        string     `json:"id"`
	Status    string     `json:"status"` // pending, running, completed, failed
	Stage     string     `json:"stage"`  // extraction, normalization, validation, completed
	Message   string     `json:"message"`
	StartTime time.Time  `json:"start_time"`
	EndTime   *time.Time `json:"end_time,omitempty"`

	// Paths produced by each stage
	StagingPath    string `json:"staging_path,omitempty"`
	NormalizedPath string `json:"normalized_path,omitempty"`
	ValidatedPath  string `json:"validated_path,omitempty"`

	// Record counts
	RecordsExtracted int `json:"records_extracted"`
	RecordsValidated int `json:"records_validated"`
	RecordsFailed    int `json:"records_failed"`

	// Date range used
	DateRangeStart string `json:"date_range_start"`
	DateRangeEnd   string `json:"date_range_end"`

	// Timestamped execution logs
	Logs string `json:"logs"`
}
