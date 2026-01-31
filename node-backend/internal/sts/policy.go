package sts

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// PolicyDocument represents an AWS IAM policy document
type PolicyDocument struct {
	Version   string      `json:"Version"`
	Statement []Statement `json:"Statement"`
}

// Statement represents a single statement in an IAM policy
type Statement struct {
	Sid       string                 `json:"Sid,omitempty"`
	Effect    string                 `json:"Effect"`
	Action    interface{}            `json:"Action"`             // Can be string or []string
	Resource  interface{}            `json:"Resource,omitempty"` // Can be string or []string
	Condition map[string]interface{} `json:"Condition,omitempty"`
}

// ToJSON converts the policy document to a JSON string
func (p *PolicyDocument) ToJSON() (string, error) {
	bytes, err := json.Marshal(p)
	if err != nil {
		return "", fmt.Errorf("failed to marshal policy: %w", err)
	}
	return string(bytes), nil
}

// ToJSONPretty converts the policy document to a pretty-printed JSON string
func (p *PolicyDocument) ToJSONPretty() (string, error) {
	bytes, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal policy: %w", err)
	}
	return string(bytes), nil
}

// BuildIcebergAccessPolicy creates a policy for accessing Iceberg tables with department and date-based partitions
// Parameters:
//   - bucket: S3 bucket name (e.g., "hospital-data")
//   - namespace: Nessie namespace (e.g., "hospital_xyz123")
//   - tablePattern: Table name pattern (e.g., "checkups_*" to match all checkup tables)
//   - departments: List of department names (e.g., ["Cardiology", "Neurology"])
//   - dates: List of dates or date patterns (e.g., ["2025-11-23", "2025-11-*", "2025-*"])
func BuildIcebergAccessPolicy(bucket, namespace, tablePattern string, departments, dates []string) (*PolicyDocument, error) {
	if bucket == "" || namespace == "" || tablePattern == "" {
		return nil, fmt.Errorf("bucket, namespace, and tablePattern are required")
	}

	policy := &PolicyDocument{
		Version:   "2012-10-17",
		Statement: []Statement{},
	}

	// Statement 1: Allow ListBucket with prefix condition (for listing metadata)
	listStatement := Statement{
		Sid:      "AllowListMetadata",
		Effect:   "Allow",
		Action:   "s3:ListBucket",
		Resource: fmt.Sprintf("arn:aws:s3:::%s", bucket),
		Condition: map[string]interface{}{
			"StringLike": map[string][]string{
				"s3:prefix": {
					fmt.Sprintf("iceberg/%s/%s/metadata/*", namespace, tablePattern),
					fmt.Sprintf("iceberg/%s/%s/data/*", namespace, tablePattern),
				},
			},
		},
	}
	policy.Statement = append(policy.Statement, listStatement)

	// Statement 2: Allow GetObject for metadata files (no condition needed, resource path restricts access)
	metadataGetStatement := Statement{
		Sid:      "AllowGetMetadata",
		Effect:   "Allow",
		Action:   "s3:GetObject",
		Resource: fmt.Sprintf("arn:aws:s3:::%s/iceberg/%s/%s/metadata/*", bucket, namespace, tablePattern),
	}
	policy.Statement = append(policy.Statement, metadataGetStatement)

	// Statement 3: Allow data access for specific department/date partition combinations
	// Path pattern: iceberg/{namespace}/{table}/data/department_name={dept}/checkup_date={date}/*
	dataResources := make([]string, 0, len(departments)*len(dates))
	for _, dept := range departments {
		for _, date := range dates {
			resource := fmt.Sprintf("arn:aws:s3:::%s/iceberg/%s/%s/data/department_name=%s/checkup_date=%s/*",
				bucket, namespace, tablePattern, dept, date)
			dataResources = append(dataResources, resource)
		}
	}

	dataStatement := Statement{
		Sid:      "AllowSpecificPartitions",
		Effect:   "Allow",
		Action:   "s3:GetObject",
		Resource: dataResources,
	}
	policy.Statement = append(policy.Statement, dataStatement)

	return policy, nil
}

// GenerateDateRange generates a list of date strings from startDate to endDate (inclusive)
// Dates should be in YYYY-MM-DD format
func GenerateDateRange(startDate, endDate string) ([]string, error) {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, fmt.Errorf("invalid start date: %w", err)
	}

	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, fmt.Errorf("invalid end date: %w", err)
	}

	if end.Before(start) {
		return nil, fmt.Errorf("end date must be after or equal to start date")
	}

	dates := []string{}
	current := start
	for !current.After(end) {
		dates = append(dates, current.Format("2006-01-02"))
		current = current.AddDate(0, 0, 1)
	}

	return dates, nil
}

// OptimizeDateRange optimizes a list of dates by using wildcards when appropriate
// For example, if all days in November 2025 are present, returns ["2025-11-*"]
// If all months in 2025 are present, returns ["2025-*"]
func OptimizeDateRange(dates []string) []string {
	if len(dates) == 0 {
		return dates
	}

	// Group dates by year-month
	monthMap := make(map[string][]string) // key: "2025-11", value: ["2025-11-01", "2025-11-02", ...]
	yearMap := make(map[string][]string)  // key: "2025", value: list of months

	for _, date := range dates {
		parts := strings.Split(date, "-")
		if len(parts) != 3 {
			continue // Skip invalid dates
		}
		year := parts[0]
		month := parts[1]
		yearMonth := fmt.Sprintf("%s-%s", year, month)

		monthMap[yearMonth] = append(monthMap[yearMonth], date)

		if !contains(yearMap[year], yearMonth) {
			yearMap[year] = append(yearMap[year], yearMonth)
		}
	}

	optimized := []string{}

	// Check if we can use year wildcards (all 12 months present)
	processedYearMonths := make(map[string]bool)
	for year, months := range yearMap {
		if len(months) == 12 {
			// Check if all months are complete (roughly 28-31 days)
			allMonthsComplete := true
			for _, yearMonth := range months {
				daysInMonth := len(monthMap[yearMonth])
				// A month is "complete" if it has at least 28 days
				if daysInMonth < 28 {
					allMonthsComplete = false
					break
				}
				processedYearMonths[yearMonth] = true
			}

			if allMonthsComplete {
				optimized = append(optimized, fmt.Sprintf("%s-*", year))
			}
		}
	}

	// Check if we can use month wildcards (all days in a month)
	for yearMonth, datesInMonth := range monthMap {
		if processedYearMonths[yearMonth] {
			continue // Already handled by year wildcard
		}

		// A month is complete if it has at least 28 days (handles Feb and other variations)
		if len(datesInMonth) >= 28 {
			optimized = append(optimized, fmt.Sprintf("%s-*", yearMonth))
		} else {
			// Add individual dates
			optimized = append(optimized, datesInMonth...)
		}
	}

	if len(optimized) == 0 {
		return dates // Return original if optimization failed
	}

	return optimized
}

// Helper function
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// GetDatesInMonth returns all dates in a given year and month
func GetDatesInMonth(year, month int) []string {
	date := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	dates := []string{}

	currentMonth := date.Month()
	for date.Month() == currentMonth {
		dates = append(dates, date.Format("2006-01-02"))
		date = date.AddDate(0, 0, 1)
	}

	return dates
}
