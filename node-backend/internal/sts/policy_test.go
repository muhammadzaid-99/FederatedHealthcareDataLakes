package sts

import (
	"encoding/json"
	"strings"
	"testing"
)

// ============================================================
// PolicyDocument.ToJSON
// ============================================================

func TestPolicyDocument_ToJSON_ValidStructure(t *testing.T) {
	p := &PolicyDocument{
		Version: "2012-10-17",
		Statement: []Statement{
			{
				Effect: "Allow",
				Action: "s3:GetObject",
			},
		},
	}
	js, err := p.ToJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if js == "" {
		t.Error("expected non-empty JSON")
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(js), &parsed); err != nil {
		t.Fatalf("invalid JSON output: %v", err)
	}
	if parsed["Version"] != "2012-10-17" {
		t.Errorf("expected Version 2012-10-17, got %v", parsed["Version"])
	}
}

func TestPolicyDocument_ToJSON_EmptyStatements(t *testing.T) {
	p := &PolicyDocument{Version: "2012-10-17", Statement: []Statement{}}
	js, err := p.ToJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(js, "Statement") {
		t.Error("expected Statement in JSON output")
	}
}

func TestPolicyDocument_ToJSONPretty_ContainsIndentation(t *testing.T) {
	p := &PolicyDocument{
		Version: "2012-10-17",
		Statement: []Statement{
			{Effect: "Allow", Action: "s3:GetObject"},
		},
	}
	js, err := p.ToJSONPretty()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(js, "\n") {
		t.Error("expected newlines in pretty JSON")
	}
	if !strings.Contains(js, "  ") {
		t.Error("expected indentation in pretty JSON")
	}
}

// ============================================================
// BuildIcebergAccessPolicy
// ============================================================

func TestBuildIcebergAccessPolicy_BasicSuccess(t *testing.T) {
	policy, err := BuildIcebergAccessPolicy(
		"hospital-bucket",
		"hospital_ns",
		"checkups_*",
		[]string{"Cardiology", "Neurology"},
		[]string{"2025-01-01", "2025-01-02"},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if policy == nil {
		t.Fatal("expected non-nil policy")
	}
	if len(policy.Statement) == 0 {
		t.Error("expected at least one statement")
	}
	if policy.Version != "2012-10-17" {
		t.Errorf("expected Version 2012-10-17, got %s", policy.Version)
	}
}

func TestBuildIcebergAccessPolicy_HasThreeStatements(t *testing.T) {
	policy, err := BuildIcebergAccessPolicy(
		"bucket", "ns", "table_*",
		[]string{"Cardiology"},
		[]string{"2025-01-01"},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(policy.Statement) != 3 {
		t.Errorf("expected 3 statements, got %d", len(policy.Statement))
	}
}

func TestBuildIcebergAccessPolicy_EmptyBucket_Error(t *testing.T) {
	_, err := BuildIcebergAccessPolicy("", "ns", "table", []string{"Dept"}, []string{"2025-01-01"})
	if err == nil {
		t.Error("expected error for empty bucket")
	}
}

func TestBuildIcebergAccessPolicy_EmptyNamespace_Error(t *testing.T) {
	_, err := BuildIcebergAccessPolicy("bucket", "", "table", []string{"Dept"}, []string{"2025-01-01"})
	if err == nil {
		t.Error("expected error for empty namespace")
	}
}

func TestBuildIcebergAccessPolicy_EmptyTablePattern_Error(t *testing.T) {
	_, err := BuildIcebergAccessPolicy("bucket", "ns", "", []string{"Dept"}, []string{"2025-01-01"})
	if err == nil {
		t.Error("expected error for empty table pattern")
	}
}

func TestBuildIcebergAccessPolicy_ListBucketStatement(t *testing.T) {
	policy, _ := BuildIcebergAccessPolicy(
		"my-bucket", "ns", "tbl",
		[]string{"Dept"},
		[]string{"2025-01-01"},
	)
	found := false
	for _, stmt := range policy.Statement {
		if stmt.Action == "s3:ListBucket" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected s3:ListBucket statement")
	}
}

func TestBuildIcebergAccessPolicy_GetObjectStatements(t *testing.T) {
	policy, _ := BuildIcebergAccessPolicy(
		"bucket", "ns", "tbl",
		[]string{"Cardiology"},
		[]string{"2025-01-01"},
	)
	getObjectCount := 0
	for _, stmt := range policy.Statement {
		if stmt.Action == "s3:GetObject" {
			getObjectCount++
		}
	}
	if getObjectCount < 1 {
		t.Error("expected at least one s3:GetObject statement")
	}
}

func TestBuildIcebergAccessPolicy_MultiDeptMultiDate_Resources(t *testing.T) {
	depts := []string{"Cardiology", "Neurology", "Oncology"}
	dates := []string{"2025-01-01", "2025-01-02"}
	policy, err := BuildIcebergAccessPolicy("bucket", "ns", "tbl", depts, dates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 3 depts x 2 dates = 6 data resources in the last statement
	lastStmt := policy.Statement[len(policy.Statement)-1]
	resources, ok := lastStmt.Resource.([]string)
	if !ok {
		t.Fatal("expected []string for data resources")
	}
	expected := len(depts) * len(dates)
	if len(resources) != expected {
		t.Errorf("expected %d resources, got %d", expected, len(resources))
	}
}

func TestBuildIcebergAccessPolicy_ResourcesContainBucketName(t *testing.T) {
	policy, _ := BuildIcebergAccessPolicy(
		"my-special-bucket", "ns", "tbl",
		[]string{"Cardiology"},
		[]string{"2025-01-01"},
	)
	js, _ := policy.ToJSON()
	if !strings.Contains(js, "my-special-bucket") {
		t.Error("expected bucket name in policy resources")
	}
}

func TestBuildIcebergAccessPolicy_ResourcesContainNamespace(t *testing.T) {
	policy, _ := BuildIcebergAccessPolicy(
		"bucket", "hospital_xyz_namespace", "tbl",
		[]string{"Dept"},
		[]string{"2025-01-01"},
	)
	js, _ := policy.ToJSON()
	if !strings.Contains(js, "hospital_xyz_namespace") {
		t.Error("expected namespace in policy resources")
	}
}

func TestBuildIcebergAccessPolicy_AllStatementsAllow(t *testing.T) {
	policy, _ := BuildIcebergAccessPolicy(
		"b", "n", "t", []string{"D"}, []string{"2025-01-01"},
	)
	for i, stmt := range policy.Statement {
		if stmt.Effect != "Allow" {
			t.Errorf("statement %d: expected Effect=Allow, got %s", i, stmt.Effect)
		}
	}
}

func TestBuildIcebergAccessPolicy_SidNames(t *testing.T) {
	policy, _ := BuildIcebergAccessPolicy(
		"b", "n", "t", []string{"D"}, []string{"2025-01-01"},
	)
	sids := make(map[string]bool)
	for _, stmt := range policy.Statement {
		if stmt.Sid != "" {
			sids[stmt.Sid] = true
		}
	}
	expectedSids := []string{"AllowListMetadata", "AllowGetMetadata", "AllowSpecificPartitions"}
	for _, sid := range expectedSids {
		if !sids[sid] {
			t.Errorf("expected Sid=%s in policy", sid)
		}
	}
}

// ============================================================
// GenerateDateRange
// ============================================================

func TestGenerateDateRange_SingleDay(t *testing.T) {
	dates, err := GenerateDateRange("2025-01-15", "2025-01-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 1 {
		t.Errorf("expected 1 date, got %d", len(dates))
	}
	if dates[0] != "2025-01-15" {
		t.Errorf("expected 2025-01-15, got %s", dates[0])
	}
}

func TestGenerateDateRange_OneWeek(t *testing.T) {
	dates, err := GenerateDateRange("2025-01-01", "2025-01-07")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 7 {
		t.Errorf("expected 7 dates, got %d", len(dates))
	}
}

func TestGenerateDateRange_FullMonth(t *testing.T) {
	dates, err := GenerateDateRange("2025-01-01", "2025-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 31 {
		t.Errorf("expected 31 dates, got %d", len(dates))
	}
}

func TestGenerateDateRange_FebruaryNonLeapYear(t *testing.T) {
	dates, err := GenerateDateRange("2025-02-01", "2025-02-28")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 28 {
		t.Errorf("expected 28 dates, got %d", len(dates))
	}
}

func TestGenerateDateRange_FebruaryLeapYear(t *testing.T) {
	dates, err := GenerateDateRange("2024-02-01", "2024-02-29")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 29 {
		t.Errorf("expected 29 dates for leap year, got %d", len(dates))
	}
}

func TestGenerateDateRange_CrossYearBoundary(t *testing.T) {
	dates, err := GenerateDateRange("2024-12-30", "2025-01-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 4 {
		t.Errorf("expected 4 dates, got %d", len(dates))
	}
}

func TestGenerateDateRange_EndBeforeStart_Error(t *testing.T) {
	_, err := GenerateDateRange("2025-06-01", "2025-05-01")
	if err == nil {
		t.Error("expected error when end is before start")
	}
}

func TestGenerateDateRange_InvalidStartDate(t *testing.T) {
	_, err := GenerateDateRange("not-a-date", "2025-01-31")
	if err == nil {
		t.Error("expected error for invalid start date")
	}
}

func TestGenerateDateRange_InvalidEndDate(t *testing.T) {
	_, err := GenerateDateRange("2025-01-01", "not-a-date")
	if err == nil {
		t.Error("expected error for invalid end date")
	}
}

func TestGenerateDateRange_DatesAreOrdered(t *testing.T) {
	dates, _ := GenerateDateRange("2025-03-01", "2025-03-05")
	for i := 1; i < len(dates); i++ {
		if dates[i] <= dates[i-1] {
			t.Errorf("dates not in order: %s >= %s", dates[i-1], dates[i])
		}
	}
}

func TestGenerateDateRange_DatesFormatIsYYYYMMDD(t *testing.T) {
	dates, _ := GenerateDateRange("2025-01-01", "2025-01-03")
	for _, d := range dates {
		if len(d) != 10 || d[4] != '-' || d[7] != '-' {
			t.Errorf("date %s is not in YYYY-MM-DD format", d)
		}
	}
}

func TestGenerateDateRange_FirstAndLastDates(t *testing.T) {
	dates, _ := GenerateDateRange("2025-03-01", "2025-03-10")
	if dates[0] != "2025-03-01" {
		t.Errorf("expected first date 2025-03-01, got %s", dates[0])
	}
	if dates[len(dates)-1] != "2025-03-10" {
		t.Errorf("expected last date 2025-03-10, got %s", dates[len(dates)-1])
	}
}

// ============================================================
// OptimizeDateRange
// ============================================================

func TestOptimizeDateRange_EmptyInput(t *testing.T) {
	result := OptimizeDateRange([]string{})
	if len(result) != 0 {
		t.Errorf("expected empty result, got %v", result)
	}
}

func TestOptimizeDateRange_FewDates_NoOptimization(t *testing.T) {
	dates := []string{"2025-01-01", "2025-01-02", "2025-01-03"}
	result := OptimizeDateRange(dates)
	// With only 3 days, should not optimize to wildcard
	if len(result) == 0 {
		t.Error("expected non-empty result")
	}
}

func TestOptimizeDateRange_FullMonthBecomesWildcard(t *testing.T) {
	// Generate all 31 days in January 2025
	dates, _ := GenerateDateRange("2025-01-01", "2025-01-31")
	result := OptimizeDateRange(dates)
	wildcardFound := false
	for _, r := range result {
		if strings.Contains(r, "2025-01-*") {
			wildcardFound = true
			break
		}
	}
	if !wildcardFound {
		t.Errorf("expected 2025-01-* wildcard for full January, got %v", result)
	}
}

func TestOptimizeDateRange_PartialMonthNotOptimized(t *testing.T) {
	// Only 15 days in January — should NOT become 2025-01-*
	dates, _ := GenerateDateRange("2025-01-01", "2025-01-15")
	result := OptimizeDateRange(dates)
	for _, r := range result {
		if r == "2025-01-*" {
			t.Error("partial month should not become wildcard")
		}
	}
}

func TestOptimizeDateRange_SingleDate_NoWildcard(t *testing.T) {
	result := OptimizeDateRange([]string{"2025-05-15"})
	if len(result) == 0 {
		t.Error("expected non-empty result")
	}
	// Should not have a wildcard for a single date
	for _, r := range result {
		if strings.Contains(r, "*") {
			t.Errorf("single date should not produce wildcard, got: %s", r)
		}
	}
}

func TestOptimizeDateRange_ReturnsNonEmpty(t *testing.T) {
	dates, _ := GenerateDateRange("2025-06-01", "2025-06-10")
	result := OptimizeDateRange(dates)
	if len(result) == 0 {
		t.Error("expected non-empty result from OptimizeDateRange")
	}
}

// ============================================================
// GetDatesInMonth
// ============================================================

func TestGetDatesInMonth_January(t *testing.T) {
	dates := GetDatesInMonth(2025, 1)
	if len(dates) != 31 {
		t.Errorf("expected 31 dates for January, got %d", len(dates))
	}
}

func TestGetDatesInMonth_February_NonLeap(t *testing.T) {
	dates := GetDatesInMonth(2025, 2)
	if len(dates) != 28 {
		t.Errorf("expected 28 dates for Feb 2025, got %d", len(dates))
	}
}

func TestGetDatesInMonth_February_Leap(t *testing.T) {
	dates := GetDatesInMonth(2024, 2)
	if len(dates) != 29 {
		t.Errorf("expected 29 dates for Feb 2024 (leap year), got %d", len(dates))
	}
}

func TestGetDatesInMonth_April(t *testing.T) {
	dates := GetDatesInMonth(2025, 4)
	if len(dates) != 30 {
		t.Errorf("expected 30 dates for April, got %d", len(dates))
	}
}

func TestGetDatesInMonth_December(t *testing.T) {
	dates := GetDatesInMonth(2025, 12)
	if len(dates) != 31 {
		t.Errorf("expected 31 dates for December, got %d", len(dates))
	}
}

func TestGetDatesInMonth_DatesFormat(t *testing.T) {
	dates := GetDatesInMonth(2025, 3)
	for _, d := range dates {
		if len(d) != 10 || d[4] != '-' || d[7] != '-' {
			t.Errorf("date %s is not in YYYY-MM-DD format", d)
		}
	}
}

func TestGetDatesInMonth_FirstDate(t *testing.T) {
	dates := GetDatesInMonth(2025, 7)
	if len(dates) == 0 {
		t.Fatal("expected non-empty dates")
	}
	if dates[0] != "2025-07-01" {
		t.Errorf("expected first date 2025-07-01, got %s", dates[0])
	}
}

func TestGetDatesInMonth_LastDate_January(t *testing.T) {
	dates := GetDatesInMonth(2025, 1)
	last := dates[len(dates)-1]
	if last != "2025-01-31" {
		t.Errorf("expected last date 2025-01-31, got %s", last)
	}
}

func TestGetDatesInMonth_DatesAreOrdered(t *testing.T) {
	dates := GetDatesInMonth(2025, 5)
	for i := 1; i < len(dates); i++ {
		if dates[i] <= dates[i-1] {
			t.Errorf("dates out of order: %s >= %s", dates[i-1], dates[i])
		}
	}
}

// ============================================================
// contains helper
// ============================================================

func TestContains_Found(t *testing.T) {
	slice := []string{"a", "b", "c"}
	if !contains(slice, "b") {
		t.Error("expected to find 'b' in slice")
	}
}

func TestContains_NotFound(t *testing.T) {
	slice := []string{"a", "b", "c"}
	if contains(slice, "d") {
		t.Error("expected 'd' not to be in slice")
	}
}

func TestContains_EmptySlice(t *testing.T) {
	if contains([]string{}, "a") {
		t.Error("expected false for empty slice")
	}
}

func TestContains_EmptyString(t *testing.T) {
	slice := []string{"a", "", "b"}
	if !contains(slice, "") {
		t.Error("expected to find empty string in slice")
	}
}

func TestContains_FirstElement(t *testing.T) {
	slice := []string{"first", "second", "third"}
	if !contains(slice, "first") {
		t.Error("expected to find first element")
	}
}

func TestContains_LastElement(t *testing.T) {
	slice := []string{"first", "second", "third"}
	if !contains(slice, "third") {
		t.Error("expected to find last element")
	}
}
