package services

import (
	"testing"
)

// ============================================================
// safeName regex tests
// ============================================================

func TestSafeName_ValidIdentifiers(t *testing.T) {
	valid := []string{
		"fhir_data",
		"checkups",
		"_private",
		"Table1",
		"my_table_123",
		"A",
		"z",
		"ALLCAPS",
		"camelCase",
		"snake_case_123",
	}
	for _, name := range valid {
		if !safeName.MatchString(name) {
			t.Errorf("expected %q to be a valid safe name", name)
		}
	}
}

func TestSafeName_InvalidIdentifiers(t *testing.T) {
	invalid := []string{
		"",
		"1startswithnumber",
		"has space",
		"has-dash",
		"has.dot",
		"has@symbol",
		"semicolon;",
		"quote'",
		`back\slash`,
		"DROP TABLE",
		"SELECT *",
		"--comment",
		"/*inject*/",
		"1234",
	}
	for _, name := range invalid {
		if safeName.MatchString(name) {
			t.Errorf("expected %q to be an invalid safe name", name)
		}
	}
}

func TestSafeName_SQLInjectionAttempts(t *testing.T) {
	injections := []string{
		"'; DROP TABLE hospitals; --",
		"1 OR 1=1",
		"table; SELECT *",
		"name' OR '1'='1",
		"UNION SELECT",
	}
	for _, s := range injections {
		if safeName.MatchString(s) {
			t.Errorf("SQL injection %q should not match safeName", s)
		}
	}
}

// ============================================================
// safeDate regex tests
// ============================================================

func TestSafeDate_ValidDates(t *testing.T) {
	valid := []string{
		"2025-01-01",
		"2024-12-31",
		"2000-06-15",
		"1999-11-30",
		"2025-03-02",
	}
	for _, d := range valid {
		if !safeDate.MatchString(d) {
			t.Errorf("expected %q to be a valid safe date", d)
		}
	}
}

func TestSafeDate_InvalidDates(t *testing.T) {
	invalid := []string{
		"",
		"2025-1-1",   // missing leading zeros
		"25-01-01",   // 2-digit year
		"2025/01/01", // wrong separator
		"01-01-2025", // wrong order (DD-MM-YYYY)
		"not-a-date",
		"2025-01-011", // extra digit
		"2025-001-01", // month too long
		"20250101",    // no dashes
		"2025-01-0A",  // non-digit
		"2025-AB-01",  // non-digit month
	}
	for _, d := range invalid {
		if safeDate.MatchString(d) {
			t.Errorf("expected %q to be an invalid safe date", d)
		}
	}
}

// ============================================================
// validateDepartments
// ============================================================

func TestValidateDepartments_SubsetIsValid(t *testing.T) {
	svc := &QueryBuilderService{}
	approved := []string{"Cardiology", "Neurology", "Oncology"}
	requested := []string{"Cardiology", "Neurology"}
	if err := svc.validateDepartments(requested, approved); err != nil {
		t.Errorf("expected nil for valid subset, got %v", err)
	}
}

func TestValidateDepartments_ExactMatchIsValid(t *testing.T) {
	svc := &QueryBuilderService{}
	depts := []string{"Cardiology", "Neurology"}
	if err := svc.validateDepartments(depts, depts); err != nil {
		t.Errorf("expected nil for exact match, got %v", err)
	}
}

func TestValidateDepartments_SingleDept(t *testing.T) {
	svc := &QueryBuilderService{}
	if err := svc.validateDepartments([]string{"Cardiology"}, []string{"Cardiology", "Neurology"}); err != nil {
		t.Errorf("expected nil for single dept subset, got %v", err)
	}
}

func TestValidateDepartments_UnapprovedDept(t *testing.T) {
	svc := &QueryBuilderService{}
	approved := []string{"Cardiology", "Neurology"}
	requested := []string{"Cardiology", "Oncology"} // Oncology not approved
	if err := svc.validateDepartments(requested, approved); err == nil {
		t.Error("expected error for unapproved department")
	}
}

func TestValidateDepartments_EmptyApproved(t *testing.T) {
	svc := &QueryBuilderService{}
	// Nothing is approved, requesting anything should fail
	if err := svc.validateDepartments([]string{"Cardiology"}, []string{}); err == nil {
		t.Error("expected error when nothing is approved")
	}
}

func TestValidateDepartments_EmptyRequested(t *testing.T) {
	svc := &QueryBuilderService{}
	// Requesting nothing is always valid (vacuously true)
	if err := svc.validateDepartments([]string{}, []string{"Cardiology"}); err != nil {
		t.Errorf("expected nil for empty requested, got %v", err)
	}
}

func TestValidateDepartments_BothEmpty(t *testing.T) {
	svc := &QueryBuilderService{}
	if err := svc.validateDepartments([]string{}, []string{}); err != nil {
		t.Errorf("expected nil for both empty, got %v", err)
	}
}

func TestValidateDepartments_CaseSensitive(t *testing.T) {
	svc := &QueryBuilderService{}
	// "cardiology" != "Cardiology"
	if err := svc.validateDepartments([]string{"cardiology"}, []string{"Cardiology"}); err == nil {
		t.Error("expected error: department match should be case-sensitive")
	}
}

func TestValidateDepartments_ErrorMessageContainsDeptName(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDepartments([]string{"Radiology"}, []string{"Cardiology"})
	if err == nil {
		t.Fatal("expected error")
	}
	if !containsSubstring(err.Error(), "Radiology") {
		t.Errorf("error should mention the bad department, got: %s", err.Error())
	}
}

func TestValidateDepartments_MultipleUnapproved(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDepartments(
		[]string{"A", "B", "C"},
		[]string{"A"},
	)
	if err == nil {
		t.Error("expected error for multiple unapproved departments")
	}
}

// ============================================================
// validateDateRange
// ============================================================

func TestValidateDateRange_WithinRange(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-02-01", "2025-02-28", "2025-01-01", "2025-12-31")
	if err != nil {
		t.Errorf("expected nil for date within range, got %v", err)
	}
}

func TestValidateDateRange_ExactApprovedRange(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-01-01", "2025-12-31", "2025-01-01", "2025-12-31")
	if err != nil {
		t.Errorf("expected nil for exact approved range, got %v", err)
	}
}

func TestValidateDateRange_EmptyApprovedRange_NoConstraint(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-01-01", "2025-12-31", "", "")
	if err != nil {
		t.Errorf("expected nil when no approved range constraint, got %v", err)
	}
}

func TestValidateDateRange_StartBeforeApprovedStart(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2024-12-01", "2025-06-30", "2025-01-01", "2025-12-31")
	if err == nil {
		t.Error("expected error for start date before approved start")
	}
}

func TestValidateDateRange_EndAfterApprovedEnd(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-01-01", "2026-01-01", "2025-01-01", "2025-12-31")
	if err == nil {
		t.Error("expected error for end date after approved end")
	}
}

func TestValidateDateRange_InvalidDateFormat_Start(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("not-a-date", "2025-12-31", "2025-01-01", "2025-12-31")
	if err == nil {
		t.Error("expected error for invalid start date format")
	}
}

func TestValidateDateRange_InvalidDateFormat_End(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-01-01", "31/12/2025", "2025-01-01", "2025-12-31")
	if err == nil {
		t.Error("expected error for invalid end date format")
	}
}

func TestValidateDateRange_EmptyRequestDates_UsesApproved(t *testing.T) {
	svc := &QueryBuilderService{}
	// Empty request dates with non-empty approved range is ok (no comparison done)
	err := svc.validateDateRange("", "", "2025-01-01", "2025-12-31")
	if err != nil {
		t.Errorf("expected nil when request dates are empty, got %v", err)
	}
}

func TestValidateDateRange_OnlyApprovedStartSet(t *testing.T) {
	svc := &QueryBuilderService{}
	// req start is after approved start - should be fine
	err := svc.validateDateRange("2025-06-01", "2025-12-31", "2025-01-01", "")
	if err != nil {
		t.Errorf("expected nil when only approvedStart is set, got %v", err)
	}
}

func TestValidateDateRange_OnlyApprovedEndSet(t *testing.T) {
	svc := &QueryBuilderService{}
	// req end is before approved end - should be fine
	err := svc.validateDateRange("2025-01-01", "2025-06-30", "", "2025-12-31")
	if err != nil {
		t.Errorf("expected nil when only approvedEnd is set, got %v", err)
	}
}

func TestValidateDateRange_ReqStartEqualsApprovedStart(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-01-01", "2025-06-30", "2025-01-01", "2025-12-31")
	if err != nil {
		t.Errorf("expected nil when req start equals approved start, got %v", err)
	}
}

func TestValidateDateRange_ReqEndEqualsApprovedEnd(t *testing.T) {
	svc := &QueryBuilderService{}
	err := svc.validateDateRange("2025-01-01", "2025-12-31", "2025-01-01", "2025-12-31")
	if err != nil {
		t.Errorf("expected nil when req end equals approved end, got %v", err)
	}
}

// ============================================================
// QueryBuilderService constructor
// ============================================================

func TestNewQueryBuilderService_StoresFields(t *testing.T) {
	svc := NewQueryBuilderService("http://proxy:8081", "api-key-123")
	if svc.proxyEndpoint != "http://proxy:8081" {
		t.Errorf("expected endpoint http://proxy:8081, got %s", svc.proxyEndpoint)
	}
	if svc.internalAPIKey != "api-key-123" {
		t.Errorf("expected api-key, got %s", svc.internalAPIKey)
	}
}

func TestNewQueryBuilderService_TrimsTrailingSlash(t *testing.T) {
	svc := NewQueryBuilderService("http://proxy:8081/", "key")
	if svc.proxyEndpoint != "http://proxy:8081" {
		t.Errorf("expected trailing slash stripped, got %s", svc.proxyEndpoint)
	}
}

func TestNewQueryBuilderService_NonNilHTTPClient(t *testing.T) {
	svc := NewQueryBuilderService("http://proxy:8081", "key")
	if svc.httpClient == nil {
		t.Error("expected non-nil http client")
	}
}

// ============================================================
// helper
// ============================================================

func containsSubstring(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		findSubstring(s, sub))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
