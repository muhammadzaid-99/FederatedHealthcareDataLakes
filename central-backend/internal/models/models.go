package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Hospital status constants
const (
	HospitalStatusPendingApproval   = "PENDING_APPROVAL"
	HospitalStatusApproved          = "APPROVED"
	HospitalStatusRejected          = "REJECTED"
	HospitalStatusCredentialsIssued = "CREDENTIALS_ISSUED"
	HospitalStatusActive            = "ACTIVE"
	HospitalStatusInactive          = "INACTIVE"
)

// Access request status constants
const (
	RequestStatusPending         = "PENDING"
	RequestStatusForwarded       = "FORWARDED"
	RequestStatusPartialApproved = "PARTIAL_APPROVED"
	RequestStatusApproved        = "APPROVED"
	RequestStatusRejected        = "REJECTED"
	RequestStatusExpired         = "EXPIRED"
)

// Requestor status constants
const (
	RequestorStatusPending  = "PENDING"
	RequestorStatusApproved = "APPROVED"
	RequestorStatusRejected = "REJECTED"
)

// Node access response status constants
const (
	ResponseStatusPending  = "PENDING"
	ResponseStatusApproved = "APPROVED"
	ResponseStatusRejected = "REJECTED"
)

// Hospital represents a hospital node in the federated system
type Hospital struct {
	ID              uuid.UUID  `gorm:"type:uuid;primary_key" json:"id"`
	Name            string     `gorm:"type:varchar(255);not null" json:"name"`
	AdminEmail      string     `gorm:"type:varchar(255);not null;uniqueIndex" json:"admin_email"`
	AdminPassword   string     `gorm:"type:varchar(255);not null" json:"-"` // bcrypt hashed
	Status          string     `gorm:"type:varchar(50);not null;index" json:"status"`
	ClientID        *string    `gorm:"type:varchar(255);uniqueIndex" json:"client_id,omitempty"`
	ClientSecret    *string    `gorm:"type:varchar(255)" json:"-"` // bcrypt hashed, never returned
	NessieNamespace *string    `gorm:"type:varchar(255)" json:"nessie_namespace,omitempty"`
	QueueName       *string    `gorm:"type:varchar(255)" json:"queue_name,omitempty"`
	MinIOEndpoint   *string    `gorm:"type:varchar(255)" json:"minio_endpoint,omitempty"`
	PublicKey       *string    `gorm:"type:text" json:"public_key,omitempty"` // Future use
	Capabilities    JSONB      `gorm:"type:jsonb" json:"capabilities,omitempty"`
	Metadata        JSONB      `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	HandshakeAt     *time.Time `json:"handshake_at,omitempty"`
}

// BeforeCreate hook to generate UUID
func (h *Hospital) BeforeCreate(tx *gorm.DB) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	return nil
}

// DataAccessRequest represents a request to access data from one or more hospitals
type DataAccessRequest struct {
	ID             uuid.UUID  `gorm:"type:uuid;primary_key" json:"id"`
	RequestorID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"requestor_id"`
	RequestedNodes JSONBArray `gorm:"type:jsonb;not null" json:"requested_nodes"` // array of hospital IDs
	Departments    []string   `gorm:"serializer:json" json:"departments"`         // departments requested
	Purpose        string     `gorm:"type:text" json:"purpose"`
	Status         string     `gorm:"type:varchar(50);not null;index" json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	// Relationships
	Requestor *Requestor           `gorm:"foreignKey:RequestorID" json:"requestor,omitempty"`
	Responses []NodeAccessResponse `gorm:"foreignKey:RequestID" json:"responses,omitempty"`
}

// BeforeCreate hook to generate UUID and set defaults
func (d *DataAccessRequest) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	if d.Status == "" {
		d.Status = RequestStatusPending
	}
	if d.ExpiresAt.IsZero() {
		d.ExpiresAt = time.Now().Add(30 * 24 * time.Hour) // 30 days default
	}
	return nil
}

// NodeAccessResponse represents a hospital node's response to an access request
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

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relationships
	Request  DataAccessRequest `gorm:"foreignKey:RequestID" json:"-"`
	Hospital Hospital          `gorm:"foreignKey:HospitalID" json:"hospital,omitempty"`
}

// BeforeCreate hook to generate UUID
func (n *NodeAccessResponse) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	if n.Status == "" {
		n.Status = ResponseStatusPending
	}
	return nil
}

// AuditLog represents an audit trail entry
type AuditLog struct {
	ID         uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	EntityType string    `gorm:"type:varchar(100);not null;index" json:"entity_type"`
	EntityID   string    `gorm:"type:varchar(255);not null;index" json:"entity_id"`
	Action     string    `gorm:"type:varchar(100);not null;index" json:"action"`
	ActorID    string    `gorm:"type:varchar(255);not null" json:"actor_id"`
	ActorType  string    `gorm:"type:varchar(50)" json:"actor_type"` // admin, hospital, system
	Details    JSONB     `gorm:"type:jsonb" json:"details,omitempty"`
	IPAddress  string    `gorm:"type:varchar(45)" json:"ip_address,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// BeforeCreate hook to generate UUID
func (a *AuditLog) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
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

// JSONBArray is a custom type for handling JSON arrays in PostgreSQL
type JSONBArray []interface{}

// Scan implements the sql.Scanner interface for arrays
func (j *JSONBArray) Scan(value interface{}) error {
	if value == nil {
		*j = make(JSONBArray, 0)
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}

	var result []interface{}
	if err := json.Unmarshal(bytes, &result); err != nil {
		return err
	}

	*j = result
	return nil
}

// Value implements the driver.Valuer interface for arrays
func (j JSONBArray) Value() (driver.Value, error) {
	if j == nil {
		return json.Marshal([]interface{}{})
	}
	return json.Marshal(j)
}

// Admin represents a central admin user
type Admin struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	Username  string    `gorm:"type:varchar(255);not null;uniqueIndex" json:"username"`
	Password  string    `gorm:"type:varchar(255);not null" json:"-"` // bcrypt hashed
	Email     string    `gorm:"type:varchar(255)" json:"email"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BeforeCreate hook to generate UUID
func (a *Admin) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// Requestor represents a data requestor (researcher) in the system
type Requestor struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key" json:"id"`
	Name         string    `gorm:"type:varchar(255);not null" json:"name"`
	Email        string    `gorm:"type:varchar(255);not null;uniqueIndex" json:"email"`
	PasswordHash string    `gorm:"type:varchar(255);not null" json:"-"` // bcrypt hashed
	Organization string    `gorm:"type:varchar(255)" json:"organization"`
	Status       string    `gorm:"type:varchar(50);not null;index" json:"status"` // PENDING, APPROVED, REJECTED
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// BeforeCreate hook to generate UUID for Requestor
func (r *Requestor) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	if r.Status == "" {
		r.Status = RequestorStatusPending
	}
	return nil
}
