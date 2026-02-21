package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/models"
	"github.com/sirupsen/logrus"
)

// ---------------------------------------------------------------------------
// Payload types – these mirror the JSON the frontend sends
// ---------------------------------------------------------------------------

// HospitalSelection represents one hospital's query parameters
type HospitalSelection struct {
	AccessResponseID string   `json:"access_response_id" binding:"required"`
	Departments      []string `json:"departments" binding:"required,min=1"`
	DateRangeStart   string   `json:"date_range_start"` // YYYY-MM-DD (optional, uses approved range if empty)
	DateRangeEnd     string   `json:"date_range_end"`   // YYYY-MM-DD (optional, uses approved range if empty)
}

// QueryPayload is the structured request sent from the query builder UI
type QueryPayload struct {
	Selections []HospitalSelection `json:"selections" binding:"required,min=1"`
	TableName  string              `json:"table_name" binding:"required"` // e.g. "fhir_data"
	Columns    []string            `json:"columns"`                      // empty = SELECT *
	Limit      int                 `json:"limit"`                        // 0 = no limit (capped server-side)
}

// QueryResult mirrors the proxy's TrinoService.QueryResult
type QueryResult struct {
	Columns  []string        `json:"columns"`
	Rows     [][]interface{} `json:"rows"`
	RowCount int             `json:"row_count"`
	Duration string          `json:"duration"`
	Error    string          `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// QueryBuilderService validates requestor access and builds safe Trino SQL.
type QueryBuilderService struct {
	proxyEndpoint  string
	internalAPIKey string
	httpClient     *http.Client
}

// NewQueryBuilderService creates a new QueryBuilderService.
func NewQueryBuilderService(proxyEndpoint, internalAPIKey string) *QueryBuilderService {
	return &QueryBuilderService{
		proxyEndpoint:  strings.TrimRight(proxyEndpoint, "/"),
		internalAPIKey: internalAPIKey,
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // Trino queries can take a while
		},
	}
}

// safeName is a strict allowlist for SQL identifiers (table/column names).
var safeName = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// safeDate validates YYYY-MM-DD format.
var safeDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ---------------------------------------------------------------------------
// BuildAndExecuteQuery is the main entry-point called by the handler.
// ---------------------------------------------------------------------------

func (s *QueryBuilderService) BuildAndExecuteQuery(
	requestorID uuid.UUID,
	payload QueryPayload,
) (*QueryResult, error) {

	// ---- basic validation ------------------------------------------------
	if !safeName.MatchString(payload.TableName) {
		return nil, fmt.Errorf("invalid table name: %q", payload.TableName)
	}
	for _, col := range payload.Columns {
		if !safeName.MatchString(col) {
			return nil, fmt.Errorf("invalid column name: %q", col)
		}
	}

	// Cap the limit to a sane maximum
	if payload.Limit <= 0 || payload.Limit > 10000 {
		payload.Limit = 1000
	}

	// ---- per-selection validation & SQL fragment building -----------------
	var unionParts []string

	for _, sel := range payload.Selections {
		responseID, err := uuid.Parse(sel.AccessResponseID)
		if err != nil {
			return nil, fmt.Errorf("invalid access_response_id: %q", sel.AccessResponseID)
		}

		// Fetch the NodeAccessResponse and verify it belongs to the requestor
		response, err := s.getVerifiedResponse(requestorID, responseID)
		if err != nil {
			return nil, err
		}

		// Validate departments are a subset of what was approved
		if err := s.validateDepartments(sel.Departments, response.Departments); err != nil {
			return nil, fmt.Errorf("hospital %s: %w", response.HospitalID, err)
		}

		// Resolve date range – fall back to approved range
		dateStart := sel.DateRangeStart
		dateEnd := sel.DateRangeEnd
		if dateStart == "" {
			dateStart = response.DateRangeStart
		}
		if dateEnd == "" {
			dateEnd = response.DateRangeEnd
		}
		if err := s.validateDateRange(dateStart, dateEnd, response.DateRangeStart, response.DateRangeEnd); err != nil {
			return nil, fmt.Errorf("hospital %s: %w", response.HospitalID, err)
		}

		// Look up the hospital to get its nessie_namespace
		var hospital models.Hospital
		if err := database.DB.First(&hospital, "id = ?", response.HospitalID).Error; err != nil {
			return nil, fmt.Errorf("hospital %s not found", response.HospitalID)
		}
		if hospital.NessieNamespace == nil || *hospital.NessieNamespace == "" {
			return nil, fmt.Errorf("hospital %s has no namespace configured", hospital.Name)
		}

		// Build the namespace::access_key_id identifier
		namespace := *hospital.NessieNamespace
		accessKeyID := response.AccessKeyID
		qualifiedNamespace := fmt.Sprintf("%s::%s", namespace, accessKeyID)

		// Build column list
		colExpr := "*"
		if len(payload.Columns) > 0 {
			colExpr = strings.Join(payload.Columns, ", ")
		}

		// Build WHERE clause
		whereParts := []string{}

		// Department filter
		deptQuoted := make([]string, len(sel.Departments))
		for i, d := range sel.Departments {
			deptQuoted[i] = fmt.Sprintf("'%s'", strings.ReplaceAll(d, "'", "''"))
		}
		whereParts = append(whereParts, fmt.Sprintf("department_name IN (%s)", strings.Join(deptQuoted, ", ")))

		// Date filters (if provided)
		if dateStart != "" {
			whereParts = append(whereParts, fmt.Sprintf("date >= DATE '%s'", dateStart))
		}
		if dateEnd != "" {
			whereParts = append(whereParts, fmt.Sprintf("date <= DATE '%s'", dateEnd))
		}

		whereClause := strings.Join(whereParts, " AND ")

		// Full SELECT for this hospital
		sql := fmt.Sprintf(
			`SELECT %s FROM iceberg."%s"."%s" WHERE %s`,
			colExpr,
			qualifiedNamespace,
			payload.TableName,
			whereClause,
		)

		unionParts = append(unionParts, sql)
	}

	// ---- combine with UNION ALL and add LIMIT ----------------------------
	fullSQL := strings.Join(unionParts, "\nUNION ALL\n")
	fullSQL = fmt.Sprintf("%s\nLIMIT %d", fullSQL, payload.Limit)

	logrus.WithFields(logrus.Fields{
		"requestor_id": requestorID,
		"sql_length":   len(fullSQL),
	}).Info("Executing structured query via proxy")

	// ---- proxy the query to central-proxy --------------------------------
	return s.proxyQuery(fullSQL)
}

// ---------------------------------------------------------------------------
// Proxy helpers (schema browsing forwarded to central-proxy)
// ---------------------------------------------------------------------------

// ProxyGetSchemas forwards schema listing through the internal API.
func (s *QueryBuilderService) ProxyGetSchemas() (json.RawMessage, error) {
	return s.proxyGET("/api/trino/schemas")
}

// ProxyGetTables forwards table listing for a given schema.
func (s *QueryBuilderService) ProxyGetTables(schema string) (json.RawMessage, error) {
	return s.proxyGET(fmt.Sprintf("/api/trino/schemas/%s/tables", schema))
}

// ProxyGetColumns forwards column listing for a table.
func (s *QueryBuilderService) ProxyGetColumns(schema, table string) (json.RawMessage, error) {
	return s.proxyGET(fmt.Sprintf("/api/trino/schemas/%s/tables/%s/columns", schema, table))
}

// ---------------------------------------------------------------------------
// GetApprovedResponses returns all APPROVED NodeAccessResponses for a given
// requestor, including the hospital relationship. Used by the UI to populate
// the query builder form.
// ---------------------------------------------------------------------------

func (s *QueryBuilderService) GetApprovedResponses(requestorID uuid.UUID) ([]models.NodeAccessResponse, error) {
	var responses []models.NodeAccessResponse
	err := database.DB.
		Joins("JOIN data_access_requests ON data_access_requests.id = node_access_responses.request_id").
		Where("data_access_requests.requestor_id = ? AND node_access_responses.status = ?",
			requestorID, models.ResponseStatusApproved).
		Preload("Hospital").
		Find(&responses).Error
	if err != nil {
		return nil, fmt.Errorf("failed to fetch approved responses: %w", err)
	}
	return responses, nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// getVerifiedResponse fetches a NodeAccessResponse and verifies:
// 1. It exists and is APPROVED
// 2. The owning DataAccessRequest belongs to requestorID
func (s *QueryBuilderService) getVerifiedResponse(
	requestorID uuid.UUID,
	responseID uuid.UUID,
) (*models.NodeAccessResponse, error) {

	var response models.NodeAccessResponse
	err := database.DB.
		Joins("JOIN data_access_requests ON data_access_requests.id = node_access_responses.request_id").
		Where("node_access_responses.id = ? AND data_access_requests.requestor_id = ?",
			responseID, requestorID).
		First(&response).Error
	if err != nil {
		return nil, fmt.Errorf("access response %s not found or does not belong to you", responseID)
	}
	if response.Status != models.ResponseStatusApproved {
		return nil, fmt.Errorf("access response %s is not approved (status: %s)", responseID, response.Status)
	}
	if response.AccessKeyID == "" {
		return nil, fmt.Errorf("access response %s has no credentials", responseID)
	}
	return &response, nil
}

// validateDepartments checks that requested departments are a subset of approved departments.
func (s *QueryBuilderService) validateDepartments(requested, approved []string) error {
	approvedSet := make(map[string]struct{}, len(approved))
	for _, d := range approved {
		approvedSet[d] = struct{}{}
	}
	for _, d := range requested {
		if _, ok := approvedSet[d]; !ok {
			return fmt.Errorf("department %q not in approved set %v", d, approved)
		}
	}
	return nil
}

// validateDateRange checks that the requested date range is within the approved range.
func (s *QueryBuilderService) validateDateRange(
	reqStart, reqEnd, approvedStart, approvedEnd string,
) error {
	// If approved range is empty there is no constraint
	if approvedStart == "" && approvedEnd == "" {
		return nil
	}

	// Validate format
	for _, d := range []string{reqStart, reqEnd} {
		if d != "" && !safeDate.MatchString(d) {
			return fmt.Errorf("invalid date format: %q (expected YYYY-MM-DD)", d)
		}
	}

	// Parse dates for comparison (simple string comparison works for YYYY-MM-DD)
	if approvedStart != "" && reqStart != "" && reqStart < approvedStart {
		return fmt.Errorf("requested start date %s is before approved start %s", reqStart, approvedStart)
	}
	if approvedEnd != "" && reqEnd != "" && reqEnd > approvedEnd {
		return fmt.Errorf("requested end date %s is after approved end %s", reqEnd, approvedEnd)
	}

	return nil
}

// proxyQuery sends a built SQL query to the central-proxy Trino endpoint.
func (s *QueryBuilderService) proxyQuery(sql string) (*QueryResult, error) {
	body, err := json.Marshal(map[string]string{"query": sql})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal query: %w", err)
	}

	req, err := http.NewRequest("POST", s.proxyEndpoint+"/api/trino/query", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-API-Key", s.internalAPIKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("proxy request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read proxy response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("proxy returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result QueryResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse proxy response: %w", err)
	}

	return &result, nil
}

// proxyGET performs a GET request to central-proxy with the internal API key.
func (s *QueryBuilderService) proxyGET(path string) (json.RawMessage, error) {
	req, err := http.NewRequest("GET", s.proxyEndpoint+path, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("X-Internal-API-Key", s.internalAPIKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("proxy request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read proxy response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("proxy returned status %d: %s", resp.StatusCode, string(body))
	}

	return json.RawMessage(body), nil
}
