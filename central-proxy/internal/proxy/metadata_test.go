package proxy

import (
"regexp"
"testing"
)

func TestLoadTablePattern_BasicMatch(t *testing.T) {
path := "/v1/namespaces/hospital_ns/tables/checkups"
matches := loadTablePattern.FindStringSubmatch(path)
if matches == nil {
t.Fatalf("expected match for path: %s", path)
}
if matches[1] != "hospital_ns" {
t.Errorf("expected namespace=hospital_ns, got %s", matches[1])
}
if matches[2] != "checkups" {
t.Errorf("expected table=checkups, got %s", matches[2])
}
}

func TestLoadTablePattern_WithPrefix(t *testing.T) {
path := "/v1/main/namespaces/my_ns/tables/my_table"
matches := loadTablePattern.FindStringSubmatch(path)
if matches == nil {
t.Fatalf("expected match for path with prefix: %s", path)
}
if matches[1] != "my_ns" {
t.Errorf("expected namespace=my_ns, got %s", matches[1])
}
if matches[2] != "my_table" {
t.Errorf("expected table=my_table, got %s", matches[2])
}
}

func TestLoadTablePattern_UppercaseV1(t *testing.T) {
path := "/V1/namespaces/NS/tables/TBL"
matches := loadTablePattern.FindStringSubmatch(path)
if matches == nil {
t.Fatalf("expected case-insensitive match for: %s", path)
}
if matches[1] != "NS" {
t.Errorf("expected NS, got %s", matches[1])
}
}

func TestLoadTablePattern_DoesNotMatchRoot(t *testing.T) {
path := "/v1/namespaces"
matches := loadTablePattern.FindStringSubmatch(path)
if matches != nil {
t.Errorf("should not match /v1/namespaces (no table): %v", matches)
}
}

func TestLoadTablePattern_DoesNotMatchWithTrailingSegment(t *testing.T) {
path := "/v1/namespaces/ns/tables/tbl/extra"
matches := loadTablePattern.FindStringSubmatch(path)
if matches != nil {
t.Errorf("should not match path with trailing segment: %v", matches)
}
}

func TestLoadTablePattern_DoesNotMatchS3Path(t *testing.T) {
path := "/s3/bucket/iceberg/ns/table/data/file.parquet"
matches := loadTablePattern.FindStringSubmatch(path)
if matches != nil {
t.Errorf("should not match S3 path: %v", matches)
}
}

func TestLoadTablePattern_DoesNotMatchCreateNamespace(t *testing.T) {
path := "/v1/namespaces/ns"
matches := loadTablePattern.FindStringSubmatch(path)
if matches != nil {
t.Errorf("should not match createNamespace path: %v", matches)
}
}

func TestLoadTablePattern_SpecialCharsInNamespace(t *testing.T) {
path := "/v1/namespaces/hospital-abc_123/tables/visits_2025"
matches := loadTablePattern.FindStringSubmatch(path)
if matches == nil {
t.Fatalf("expected match for namespace with special chars: %s", path)
}
if matches[1] != "hospital-abc_123" {
t.Errorf("expected hospital-abc_123, got %s", matches[1])
}
if matches[2] != "visits_2025" {
t.Errorf("expected visits_2025, got %s", matches[2])
}
}

func TestLoadTablePattern_IsCompiledRegex(t *testing.T) {
var _ *regexp.Regexp = loadTablePattern
}

func TestTruncateString_ShorterThanMax(t *testing.T) {
result := truncateString("hello", 10)
if result != "hello" {
t.Errorf("expected hello, got %s", result)
}
}

func TestTruncateString_ExactlyMax(t *testing.T) {
result := truncateString("hello", 5)
if result != "hello" {
t.Errorf("expected hello, got %s", result)
}
}

func TestTruncateString_LongerThanMax(t *testing.T) {
result := truncateString("hello world", 5)
if result != "hello" {
t.Errorf("expected hello, got %s", result)
}
}

func TestTruncateString_EmptyString(t *testing.T) {
result := truncateString("", 5)
if result != "" {
t.Errorf("expected empty string, got %s", result)
}
}

func TestTruncateString_MaxZero(t *testing.T) {
result := truncateString("hello", 0)
if result != "" {
t.Errorf("expected empty result with maxLen=0, got %s", result)
}
}

func TestTruncateString_MaxOne(t *testing.T) {
result := truncateString("abcdef", 1)
if result != "a" {
t.Errorf("expected a, got %s", result)
}
}

func TestTruncateString_LongInput(t *testing.T) {
input := "AKID1234567890ABCDEF"
result := truncateString(input, 8)
if len(result) != 8 {
t.Errorf("expected length 8, got %d", len(result))
}
if result != input[:8] {
t.Errorf("expected %s, got %s", input[:8], result)
}
}

func TestTruncateString_ShortInput(t *testing.T) {
result := truncateString("abcdefghij", 4)
if result != "abcd" {
t.Errorf("expected abcd, got %s", result)
}
}
