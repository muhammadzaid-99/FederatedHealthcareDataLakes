package proxy

import (
"testing"
)

func TestParseNamespaceAccessKey_WithSeparator(t *testing.T) {
ns, akid := parseNamespaceAccessKey("hospital_xyz::AKID1234567890")
if ns != "hospital_xyz" {
t.Errorf("expected namespace=hospital_xyz, got %s", ns)
}
if akid != "AKID1234567890" {
t.Errorf("expected akid=AKID1234567890, got %s", akid)
}
}

func TestParseNamespaceAccessKey_NoSeparator(t *testing.T) {
ns, akid := parseNamespaceAccessKey("hospital_xyz_plain")
if ns != "hospital_xyz_plain" {
t.Errorf("expected full namespace, got %s", ns)
}
if akid != "" {
t.Errorf("expected empty akid, got %s", akid)
}
}

func TestParseNamespaceAccessKey_EmptyString(t *testing.T) {
ns, akid := parseNamespaceAccessKey("")
if ns != "" {
t.Errorf("expected empty namespace, got %s", ns)
}
if akid != "" {
t.Errorf("expected empty akid, got %s", akid)
}
}

func TestParseNamespaceAccessKey_OnlySeparator(t *testing.T) {
ns, akid := parseNamespaceAccessKey("::")
if ns != "" {
t.Errorf("expected empty namespace for '::' input, got %s", ns)
}
if akid != "" {
t.Errorf("expected empty akid for '::' input, got %s", akid)
}
}

func TestParseNamespaceAccessKey_SeparatorAtStart(t *testing.T) {
ns, akid := parseNamespaceAccessKey("::AKID")
if ns != "" {
t.Errorf("expected empty namespace, got %s", ns)
}
if akid != "AKID" {
t.Errorf("expected akid=AKID, got %s", akid)
}
}

func TestParseNamespaceAccessKey_SeparatorAtEnd(t *testing.T) {
ns, akid := parseNamespaceAccessKey("hospital_ns::")
if ns != "hospital_ns" {
t.Errorf("expected namespace=hospital_ns, got %s", ns)
}
if akid != "" {
t.Errorf("expected empty akid, got %s", akid)
}
}

func TestParseNamespaceAccessKey_MultipleSeparators(t *testing.T) {
ns, akid := parseNamespaceAccessKey("ns::part1::part2")
if ns != "ns" {
t.Errorf("expected ns, got %s", ns)
}
if akid != "part1::part2" {
t.Errorf("expected part1::part2, got %s", akid)
}
}

func TestParseNamespaceAccessKey_LongNamespace(t *testing.T) {
long := "hospital_very_long_namespace_identifier_123456789"
ns, akid := parseNamespaceAccessKey(long)
if ns != long {
t.Errorf("expected full namespace preserved, got %s", ns)
}
if akid != "" {
t.Errorf("expected empty akid, got %s", akid)
}
}

func TestParseNamespaceAccessKey_LongKey(t *testing.T) {
input := "ns::AKIAIOSFODNN7EXAMPLE"
ns, akid := parseNamespaceAccessKey(input)
if ns != "ns" {
t.Errorf("expected ns, got %s", ns)
}
if akid != "AKIAIOSFODNN7EXAMPLE" {
t.Errorf("expected AKIAIOSFODNN7EXAMPLE, got %s", akid)
}
}

func newTestS3DataRouter() *S3DataRouter {
return &S3DataRouter{}
}

func TestExtractNamespaceFromPath_IcebergSegment(t *testing.T) {
r := newTestS3DataRouter()
path := "hospital-data/iceberg/hospital_namespace_xyz/checkups/data/file.parquet"
ns := r.extractNamespaceFromPath(path)
if ns != "hospital_namespace_xyz" {
t.Errorf("expected hospital_namespace_xyz, got %s", ns)
}
}

func TestExtractNamespaceFromPath_IcebergAtStart(t *testing.T) {
r := newTestS3DataRouter()
path := "iceberg/my_namespace/table/data/partition"
ns := r.extractNamespaceFromPath(path)
if ns != "my_namespace" {
t.Errorf("expected my_namespace, got %s", ns)
}
}

func TestExtractNamespaceFromPath_NoIcebergSegment(t *testing.T) {
r := newTestS3DataRouter()
path := "bucket/some/other/path/without/the_word"
ns := r.extractNamespaceFromPath(path)
if ns != "" {
t.Errorf("expected empty string, got %s", ns)
}
}

func TestExtractNamespaceFromPath_EmptyPath(t *testing.T) {
r := newTestS3DataRouter()
ns := r.extractNamespaceFromPath("")
if ns != "" {
t.Errorf("expected empty string for empty path, got %s", ns)
}
}

func TestExtractNamespaceFromPath_IcebergIsLastSegment(t *testing.T) {
r := newTestS3DataRouter()
path := "bucket/data/iceberg"
ns := r.extractNamespaceFromPath(path)
if ns != "" {
t.Errorf("expected empty string when iceberg is last segment, got %s", ns)
}
}

func TestExtractNamespaceFromPath_NamespaceWithDoubleColon(t *testing.T) {
r := newTestS3DataRouter()
path := "bucket/iceberg/hospital_xyz::AKID1234/table/data"
ns := r.extractNamespaceFromPath(path)
if ns != "hospital_xyz::AKID1234" {
t.Errorf("expected hospital_xyz::AKID1234, got %s", ns)
}
}

func TestExtractNamespaceFromPath_MultipleIcebergSegments(t *testing.T) {
r := newTestS3DataRouter()
path := "iceberg/first_ns/iceberg/second_ns"
ns := r.extractNamespaceFromPath(path)
if ns != "first_ns" {
t.Errorf("expected first_ns (first match), got %s", ns)
}
}

func TestExtractNamespaceFromPath_ShortPath(t *testing.T) {
r := newTestS3DataRouter()
path := "iceberg/ns_only"
ns := r.extractNamespaceFromPath(path)
if ns != "ns_only" {
t.Errorf("expected ns_only, got %s", ns)
}
}
