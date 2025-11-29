package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NodeConfig stores the node's configuration received from central-backend
// This includes client credentials, queue info, and connection details
type NodeConfig struct {
	ID                uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	ClientID          string    `gorm:"unique;not null" json:"client_id"`
	ClientSecret      string    `gorm:"not null" json:"-"` // Never expose in JSON
	QueueName         string    `gorm:"not null" json:"queue_name"`
	NessieNamespace   string    `json:"nessie_namespace"`
	MinioEndpoint     string    `json:"minio_endpoint"`
	CentralBackendURL string    `json:"central_backend_url"`

	// Access token management
	AccessToken    string    `json:"-"` // Current access token for central-backend
	TokenExpiresAt time.Time `json:"-"` // When current token expires

	// Timestamps
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (n *NodeConfig) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}

// User represents a local user account for node-web authentication
type User struct {
	ID       uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	Username string    `gorm:"unique;not null" json:"username"`
	Email    string    `gorm:"unique;not null" json:"email"`
	Password string    `gorm:"not null" json:"-"`                       // Hashed password
	Role     string    `gorm:"not null;default:'operator'" json:"role"` // admin, operator, viewer

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// Message represents a RabbitMQ message received from central-backend
type Message struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key" json:"id"`
	QueueName   string     `gorm:"not null" json:"queue_name"`
	MessageType string     `json:"message_type"`                    // e.g., "data_request", "notification"
	Payload     string     `gorm:"type:text" json:"payload"`        // JSON payload as string
	Status      string     `gorm:"default:'pending'" json:"status"` // pending, processed, failed
	ProcessedAt *time.Time `json:"processed_at,omitempty"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (m *Message) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}

// ETLConfig stores the configuration for the ETL pipeline
type ETLConfig struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`

	// Database Configuration
	DBHost     string `gorm:"not null" json:"db_host"`
	DBPort     int    `gorm:"not null" json:"db_port"`
	DBName     string `gorm:"not null" json:"db_name"`
	DBUser     string `gorm:"not null" json:"db_user"`
	DBPassword string `gorm:"not null" json:"db_password,omitempty"`
	DBTable    string `gorm:"not null" json:"db_table"`

	// MinIO Configuration
	MinioEndpoint  string `gorm:"not null" json:"minio_endpoint"`
	MinioAccessKey string `gorm:"not null" json:"minio_access_key"`
	MinioSecretKey string `gorm:"not null" json:"minio_secret_key,omitempty"`
	MinioBucket    string `gorm:"not null" json:"minio_bucket"`

	// Python Environment
	PythonPath  string `gorm:"not null" json:"python_path"`  // Path to Python executable
	ScriptsPath string `gorm:"not null" json:"scripts_path"` // Path to ETL scripts
	JDBCPath    string `gorm:"not null" json:"jdbc_path"`    // Path to PostgreSQL JDBC driver

	// Scheduling Configuration
	ScheduleEnabled  bool   `gorm:"default:false" json:"schedule_enabled"`
	ScheduleType     string `json:"schedule_type"`     // "frequency", "cron", "manual"
	FrequencySeconds int    `json:"frequency_seconds"` // For frequency-based scheduling
	CronExpression   string `json:"cron_expression"`   // For cron-based scheduling

	// Additional Settings
	OutputDir         string   `json:"output_dir"`                         // Local output directory for parquet files
	Departments       []string `gorm:"serializer:json" json:"departments"` // e.g., ["cardiology", "neurology"]
	EnrichmentVersion string   `json:"enrichment_version"`                 // Version tag for enrichment logic

	// Tracking
	LastRunAt  *time.Time `json:"last_run_at,omitempty"`
	LastRunEnd *time.Time `json:"last_run_end,omitempty"`
	IsActive   bool       `gorm:"default:false" json:"is_active"` // Is scheduler currently running

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (e *ETLConfig) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}

// ETLJob represents a single ETL job execution
type ETLJob struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`

	// Job Metadata
	ConfigID  uuid.UUID  `gorm:"type:uuid;not null" json:"config_id"` // Reference to ETLConfig
	StartTime time.Time  `gorm:"not null" json:"start_time"`
	EndTime   *time.Time `json:"end_time,omitempty"`

	// Job Parameters
	DateRangeStart string `json:"date_range_start"` // ISO8601 format
	DateRangeEnd   string `json:"date_range_end"`   // ISO8601 format

	// Job Status
	Status  string `gorm:"default:'pending'" json:"status"` // pending, running, completed, failed
	Stage   string `json:"stage"`                           // extraction, normalization, validation, cleanup
	Message string `gorm:"type:text" json:"message"`        // Status message or error

	// Execution Results
	RecordsExtracted int    `json:"records_extracted"`
	RecordsValidated int    `json:"records_validated"`
	RecordsFailed    int    `json:"records_failed"`
	StagingPath      string `json:"staging_path"`
	NormalizedPath   string `json:"normalized_path"`
	ValidatedPath    string `json:"validated_path"`

	// Logs - stores timestamped execution logs
	Logs string `gorm:"type:text" json:"logs"` // JSON array of log entries with timestamps

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (e *ETLJob) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}

// DataRequest represents a data access request that needs approval
type DataRequest struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`

	// Request Origin
	MessageID   uuid.UUID `gorm:"type:uuid" json:"message_id"` // Link to Message table
	RequestorID string    `json:"requestor_id"`                // ID of entity requesting data
	RequestType string    `json:"request_type"`                // e.g., "iceberg_table_access"

	// Status Management
	Status     string     `gorm:"default:'pending'" json:"status"` // pending, approved, rejected
	ApprovedAt *time.Time `json:"approved_at,omitempty"`
	RejectedAt *time.Time `json:"rejected_at,omitempty"`
	ApprovedBy string     `json:"approved_by,omitempty"` // Username who approved/rejected
	RejectedBy string     `json:"rejected_by,omitempty"`

	// Date Range for Data Access
	DateRangeStart string `json:"date_range_start,omitempty"` // YYYY-MM-DD format
	DateRangeEnd   string `json:"date_range_end,omitempty"`   // YYYY-MM-DD format or pattern like "2025-11-*"

	// Generated Policy and Credentials (stored as JSON)
	PolicyJSON      string `gorm:"type:text" json:"policy_json,omitempty"`      // Full IAM policy as JSON string
	CredentialsJSON string `gorm:"type:text" json:"credentials_json,omitempty"` // Temporary credentials as JSON

	// Additional Metadata
	RequestPayload string `gorm:"type:text" json:"request_payload,omitempty"` // Original request data as JSON
	Notes          string `gorm:"type:text" json:"notes,omitempty"`           // Approval/rejection notes

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (d *DataRequest) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}
