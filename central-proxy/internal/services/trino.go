package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/trinodb/trino-go-client/trino"
)

// TrinoService handles queries to Trino
type TrinoService struct {
	db *sql.DB
}

// QueryResult represents the result of a Trino query
type QueryResult struct {
	Columns  []string        `json:"columns"`
	Rows     [][]interface{} `json:"rows"`
	RowCount int             `json:"row_count"`
	Duration string          `json:"duration"`
	Error    string          `json:"error,omitempty"`
}

// SchemaInfo represents schema/table information
type SchemaInfo struct {
	Catalog string   `json:"catalog"`
	Schemas []string `json:"schemas"`
}

// TableInfo represents table information
type TableInfo struct {
	Schema string   `json:"schema"`
	Tables []string `json:"tables"`
}

// NewTrinoService creates a new Trino service.
// dsn can be:
//   - A full URL like "https://admin@trino.healthlake.tech:443?catalog=iceberg"
//   - A simple "http://admin@host:port?catalog=iceberg" for local Docker
func NewTrinoService(dsn string) (*TrinoService, error) {
	db, err := sql.Open("trino", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Trino: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping Trino: %w", err)
	}

	return &TrinoService{db: db}, nil
}

// ExecuteQuery executes a SQL query on Trino and returns the results
func (s *TrinoService) ExecuteQuery(query string) (*QueryResult, error) {
	start := time.Now()

	rows, err := s.db.Query(query)
	if err != nil {
		return &QueryResult{
			Error:    err.Error(),
			Duration: time.Since(start).String(),
		}, nil
	}
	defer rows.Close()

	// Get column information
	columns, err := rows.Columns()
	if err != nil {
		return &QueryResult{
			Error:    fmt.Sprintf("failed to get columns: %v", err),
			Duration: time.Since(start).String(),
		}, nil
	}

	// Prepare result slice — must be initialized (not nil) so JSON marshals as [] not null
	resultRows := make([][]interface{}, 0)

	// Create interface slice for scanning
	values := make([]interface{}, len(columns))
	valuePtrs := make([]interface{}, len(columns))
	for i := range values {
		valuePtrs[i] = &values[i]
	}

	// Iterate over rows
	for rows.Next() {
		if err := rows.Scan(valuePtrs...); err != nil {
			return &QueryResult{
				Columns:  columns,
				Rows:     resultRows,
				Error:    fmt.Sprintf("failed to scan row: %v", err),
				Duration: time.Since(start).String(),
			}, nil
		}

		// Convert values to JSON-serializable format
		row := make([]interface{}, len(columns))
		for i, v := range values {
			row[i] = convertValue(v)
		}
		resultRows = append(resultRows, row)
	}

	if err := rows.Err(); err != nil {
		return &QueryResult{
			Columns:  columns,
			Rows:     resultRows,
			Error:    fmt.Sprintf("row iteration error: %v", err),
			Duration: time.Since(start).String(),
		}, nil
	}

	return &QueryResult{
		Columns:  columns,
		Rows:     resultRows,
		RowCount: len(resultRows),
		Duration: time.Since(start).String(),
	}, nil
}

// GetSchemas returns all schemas in the iceberg catalog
func (s *TrinoService) GetSchemas() (*SchemaInfo, error) {
	rows, err := s.db.Query("SHOW SCHEMAS FROM iceberg")
	if err != nil {
		return nil, fmt.Errorf("failed to get schemas: %w", err)
	}
	defer rows.Close()

	var schemas []string
	for rows.Next() {
		var schema string
		if err := rows.Scan(&schema); err != nil {
			return nil, fmt.Errorf("failed to scan schema: %w", err)
		}
		schemas = append(schemas, schema)
	}

	return &SchemaInfo{
		Catalog: "iceberg",
		Schemas: schemas,
	}, nil
}

// GetTables returns all tables in a schema
func (s *TrinoService) GetTables(schema string) (*TableInfo, error) {
	query := fmt.Sprintf("SHOW TABLES FROM iceberg.\"%s\"", schema)
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get tables: %w", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			return nil, fmt.Errorf("failed to scan table: %w", err)
		}
		tables = append(tables, table)
	}

	return &TableInfo{
		Schema: schema,
		Tables: tables,
	}, nil
}

// GetTableColumns returns column information for a table
func (s *TrinoService) GetTableColumns(schema, table string) ([]map[string]string, error) {
	query := fmt.Sprintf("DESCRIBE iceberg.\"%s\".\"%s\"", schema, table)
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to describe table: %w", err)
	}
	defer rows.Close()

	var columns []map[string]string
	cols, _ := rows.Columns()

	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		colInfo := make(map[string]string)
		for i, col := range cols {
			if values[i] != nil {
				colInfo[col] = fmt.Sprintf("%v", values[i])
			}
		}
		columns = append(columns, colInfo)
	}

	return columns, nil
}

// Close closes the database connection
func (s *TrinoService) Close() error {
	return s.db.Close()
}

// convertValue converts a value to a JSON-serializable format
func convertValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case []byte:
		// Try to parse as JSON first
		var jsonVal interface{}
		if err := json.Unmarshal(val, &jsonVal); err == nil {
			return jsonVal
		}
		return string(val)
	case time.Time:
		return val.Format(time.RFC3339)
	default:
		return val
	}
}
