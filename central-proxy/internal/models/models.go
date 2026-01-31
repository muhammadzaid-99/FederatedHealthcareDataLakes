package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Hospital represents a hospital node in the federated system
// Copied from central-backend for reading hospital data
type Hospital struct {
	ID              uuid.UUID  `gorm:"type:uuid;primary_key" json:"id"`
	Name            string     `gorm:"type:varchar(255);not null" json:"name"`
	AdminEmail      string     `gorm:"type:varchar(255);not null;uniqueIndex" json:"admin_email"`
	AdminPassword   string     `gorm:"type:varchar(255);not null" json:"-"`
	Status          string     `gorm:"type:varchar(50);not null;index" json:"status"`
	ClientID        *string    `gorm:"type:varchar(255);uniqueIndex" json:"client_id,omitempty"`
	ClientSecret    *string    `gorm:"type:varchar(255)" json:"-"`
	NessieNamespace *string    `gorm:"type:varchar(255)" json:"nessie_namespace,omitempty"`
	QueueName       *string    `gorm:"type:varchar(255)" json:"queue_name,omitempty"`
	MinIOEndpoint   *string    `gorm:"type:varchar(255)" json:"minio_endpoint,omitempty"`
	PublicKey       *string    `gorm:"type:text" json:"public_key,omitempty"`
	Capabilities    JSONB      `gorm:"type:jsonb" json:"capabilities,omitempty"`
	Metadata        JSONB      `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	HandshakeAt     *time.Time `json:"handshake_at,omitempty"`
}

// TableName specifies the table name for Hospital
func (Hospital) TableName() string {
	return "hospitals"
}

// NodeAccessResponse represents a hospital node's response to an access request
// Copied from central-backend for reading credentials
type NodeAccessResponse struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key" json:"id"`
	RequestID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"request_id"`
	HospitalID   uuid.UUID  `gorm:"type:uuid;not null;index" json:"hospital_id"`
	Status       string     `gorm:"type:varchar(50);not null" json:"status"`
	PresignedURL string     `gorm:"type:text" json:"presigned_url,omitempty"`
	ValidUntil   *time.Time `json:"valid_until,omitempty"`
	RespondedAt  *time.Time `json:"responded_at,omitempty"`
	Notes        string     `gorm:"type:text" json:"notes,omitempty"`

	// STS Credentials for data access
	AccessKeyID     string     `gorm:"type:varchar(255)" json:"access_key_id,omitempty"`
	SecretAccessKey string     `gorm:"type:text" json:"secret_access_key,omitempty"`
	SessionToken    string     `gorm:"type:text" json:"session_token,omitempty"`
	CredExpiration  *time.Time `json:"cred_expiration,omitempty"`

	// Departments approved for access
	Departments []string `gorm:"serializer:json" json:"departments,omitempty"`

	// Date range approved for access
	DateRangeStart string `gorm:"type:varchar(50)" json:"date_range_start,omitempty"`
	DateRangeEnd   string `gorm:"type:varchar(50)" json:"date_range_end,omitempty"`

	// IAM Policy used
	PolicyJSON string `gorm:"type:text" json:"policy_json,omitempty"`

	// MinIO endpoint and Nessie namespace (may be stored here too)
	MinIOEndpoint   string `gorm:"type:varchar(255)" json:"minio_endpoint,omitempty"`
	NessieNamespace string `gorm:"type:varchar(255)" json:"nessie_namespace,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relationships
	Hospital Hospital `gorm:"foreignKey:HospitalID" json:"hospital,omitempty"`
}

// TableName specifies the table name for NodeAccessResponse
func (NodeAccessResponse) TableName() string {
	return "node_access_responses"
}

// STSCredentials holds the temporary credentials for S3 access
type STSCredentials struct {
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	Expiration      *time.Time
	MinIOEndpoint   string
	NessieNamespace string
}

// IsExpired checks if the credentials are expired
func (c *STSCredentials) IsExpired() bool {
	if c.Expiration == nil {
		return false
	}
	return time.Now().After(*c.Expiration)
}

// IsValid checks if credentials are present and not expired
func (c *STSCredentials) IsValid() bool {
	return c.AccessKeyID != "" && c.SecretAccessKey != "" && !c.IsExpired()
}

// HospitalInfo holds cached hospital information
type HospitalInfo struct {
	ID              uuid.UUID
	Name            string
	NessieNamespace string
	MinIOEndpoint   string
}

// JSONB is a custom type for handling JSON data in PostgreSQL
type JSONB map[string]interface{}

// Scan implements the sql.Scanner interface
func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = make(JSONB)
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}

	result := make(JSONB)
	if err := json.Unmarshal(bytes, &result); err != nil {
		return err
	}

	*j = result
	return nil
}

// Value implements the driver.Valuer interface
func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}
