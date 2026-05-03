package config

import (
	"os"
	"strings"
	"testing"
)

// ============================================================
// DatabaseConfig.GetDSN
// ============================================================

func TestDatabaseConfig_GetDSN_BasicFormat(t *testing.T) {
	cfg := DatabaseConfig{
		Host:     "localhost",
		Port:     5432,
		User:     "testuser",
		Password: "testpass",
		Name:     "testdb",
		SSLMode:  "disable",
	}
	dsn := cfg.GetDSN()
	expected := "host=localhost port=5432 user=testuser password=testpass dbname=testdb sslmode=disable"
	if dsn != expected {
		t.Errorf("expected %q, got %q", expected, dsn)
	}
}

func TestDatabaseConfig_GetDSN_SSLRequired(t *testing.T) {
	cfg := DatabaseConfig{
		Host:     "db.example.com",
		Port:     5433,
		User:     "admin",
		Password: "s3cr3t",
		Name:     "prod_db",
		SSLMode:  "require",
	}
	dsn := cfg.GetDSN()
	if !strings.Contains(dsn, "sslmode=require") {
		t.Errorf("expected sslmode=require in DSN, got: %s", dsn)
	}
	if !strings.Contains(dsn, "host=db.example.com") {
		t.Errorf("expected host in DSN, got: %s", dsn)
	}
	if !strings.Contains(dsn, "port=5433") {
		t.Errorf("expected port=5433 in DSN, got: %s", dsn)
	}
}

func TestDatabaseConfig_GetDSN_ContainsAllFields(t *testing.T) {
	cfg := DatabaseConfig{
		Host:     "myhost",
		Port:     1234,
		User:     "myuser",
		Password: "mypassword",
		Name:     "mydb",
		SSLMode:  "verify-full",
	}
	dsn := cfg.GetDSN()
	checks := []string{"myhost", "1234", "myuser", "mypassword", "mydb", "verify-full"}
	for _, check := range checks {
		if !strings.Contains(dsn, check) {
			t.Errorf("expected %q in DSN %q", check, dsn)
		}
	}
}

func TestDatabaseConfig_GetDSN_DefaultPort(t *testing.T) {
	cfg := DatabaseConfig{
		Host:    "localhost",
		Port:    5432,
		User:    "u",
		Name:    "db",
		SSLMode: "disable",
	}
	dsn := cfg.GetDSN()
	if !strings.Contains(dsn, "port=5432") {
		t.Errorf("expected port=5432 in DSN, got: %s", dsn)
	}
}

// ============================================================
// RabbitMQConfig.GetAMQPURL
// ============================================================

func TestRabbitMQConfig_GetAMQPURL_DefaultCredentials(t *testing.T) {
	cfg := RabbitMQConfig{
		User:     "guest",
		Password: "guest",
		Host:     "localhost",
		Port:     5672,
	}
	url := cfg.GetAMQPURL()
	expected := "amqp://guest:guest@localhost:5672/"
	if url != expected {
		t.Errorf("expected %q, got %q", expected, url)
	}
}

func TestRabbitMQConfig_GetAMQPURL_CustomCredentials(t *testing.T) {
	cfg := RabbitMQConfig{
		User:     "rabbitmq",
		Password: "str0ngpass",
		Host:     "rabbitmq.internal",
		Port:     5673,
	}
	url := cfg.GetAMQPURL()
	expected := "amqp://rabbitmq:str0ngpass@rabbitmq.internal:5673/"
	if url != expected {
		t.Errorf("expected %q, got %q", expected, url)
	}
}

func TestRabbitMQConfig_GetAMQPURL_StartsWithAMQP(t *testing.T) {
	cfg := RabbitMQConfig{User: "u", Password: "p", Host: "h", Port: 5672}
	url := cfg.GetAMQPURL()
	if !strings.HasPrefix(url, "amqp://") {
		t.Errorf("expected amqp:// prefix, got %s", url)
	}
}

func TestRabbitMQConfig_GetAMQPURL_EndsWithSlash(t *testing.T) {
	cfg := RabbitMQConfig{User: "u", Password: "p", Host: "h", Port: 5672}
	url := cfg.GetAMQPURL()
	if !strings.HasSuffix(url, "/") {
		t.Errorf("expected trailing /, got %s", url)
	}
}

func TestRabbitMQConfig_GetAMQPURL_ContainsPort(t *testing.T) {
	cfg := RabbitMQConfig{User: "u", Password: "p", Host: "host", Port: 5999}
	url := cfg.GetAMQPURL()
	if !strings.Contains(url, "5999") {
		t.Errorf("expected port 5999 in URL, got %s", url)
	}
}

// ============================================================
// Config.Validate
// ============================================================

func TestConfig_Validate_ValidDevelopment(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: "localhost"},
		RabbitMQ: RabbitMQConfig{Host: "localhost"},
		Nessie:   NessieConfig{Endpoint: "http://localhost:19120"},
		App: AppConfig{
			JWTSecret:   "my-unique-secret",
			Environment: "development",
		},
	}
	if err := cfg.Validate(); err != nil {
		t.Errorf("expected no error for valid dev config, got %v", err)
	}
}

func TestConfig_Validate_EmptyDBHost(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: ""},
		RabbitMQ: RabbitMQConfig{Host: "localhost"},
		Nessie:   NessieConfig{Endpoint: "http://localhost"},
		App:      AppConfig{JWTSecret: "secret", Environment: "development"},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for empty DB host")
	}
}

func TestConfig_Validate_EmptyRabbitMQHost(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: "localhost"},
		RabbitMQ: RabbitMQConfig{Host: ""},
		Nessie:   NessieConfig{Endpoint: "http://localhost"},
		App:      AppConfig{JWTSecret: "secret", Environment: "development"},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for empty RabbitMQ host")
	}
}

func TestConfig_Validate_EmptyNessieEndpoint(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: "localhost"},
		RabbitMQ: RabbitMQConfig{Host: "localhost"},
		Nessie:   NessieConfig{Endpoint: ""},
		App:      AppConfig{JWTSecret: "secret", Environment: "development"},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for empty Nessie endpoint")
	}
}

func TestConfig_Validate_DefaultJWTSecretInProduction(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: "localhost"},
		RabbitMQ: RabbitMQConfig{Host: "localhost"},
		Nessie:   NessieConfig{Endpoint: "http://localhost"},
		App: AppConfig{
			JWTSecret:   "change-me-in-production",
			Environment: "production",
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for default JWT secret in production")
	}
}

func TestConfig_Validate_DefaultJWTSecretInDevelopment(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: "localhost"},
		RabbitMQ: RabbitMQConfig{Host: "localhost"},
		Nessie:   NessieConfig{Endpoint: "http://localhost"},
		App: AppConfig{
			JWTSecret:   "change-me-in-production",
			Environment: "development",
		},
	}
	// Should only warn, not error in development
	if err := cfg.Validate(); err != nil {
		t.Errorf("expected no error for default JWT in development, got %v", err)
	}
}

func TestConfig_Validate_EmptyJWTSecretInProduction(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{Host: "localhost"},
		RabbitMQ: RabbitMQConfig{Host: "localhost"},
		Nessie:   NessieConfig{Endpoint: "http://localhost"},
		App: AppConfig{
			JWTSecret:   "",
			Environment: "production",
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for empty JWT secret in production")
	}
}

// ============================================================
// getEnv helper
// ============================================================

func TestGetEnv_ReturnsDefaultWhenUnset(t *testing.T) {
	os.Unsetenv("TEST_CB_UNIQUE_VAR_12345")
	val := getEnv("TEST_CB_UNIQUE_VAR_12345", "default_val")
	if val != "default_val" {
		t.Errorf("expected default_val, got %s", val)
	}
}

func TestGetEnv_ReturnsSetValue(t *testing.T) {
	os.Setenv("TEST_CB_UNIQUE_VAR_12345", "custom_val")
	defer os.Unsetenv("TEST_CB_UNIQUE_VAR_12345")
	val := getEnv("TEST_CB_UNIQUE_VAR_12345", "default_val")
	if val != "custom_val" {
		t.Errorf("expected custom_val, got %s", val)
	}
}

func TestGetEnv_EmptyStringUsesDefault(t *testing.T) {
	os.Unsetenv("TEST_CB_EMPTY_VAR_XYZ")
	val := getEnv("TEST_CB_EMPTY_VAR_XYZ", "fallback")
	if val != "fallback" {
		t.Errorf("expected fallback, got %s", val)
	}
}

// ============================================================
// getEnvAsInt helper
// ============================================================

func TestGetEnvAsInt_ReturnsDefaultWhenUnset(t *testing.T) {
	os.Unsetenv("TEST_CB_INT_VAR_UNIQUE")
	val := getEnvAsInt("TEST_CB_INT_VAR_UNIQUE", 42)
	if val != 42 {
		t.Errorf("expected 42, got %d", val)
	}
}

func TestGetEnvAsInt_ReturnsSetIntValue(t *testing.T) {
	os.Setenv("TEST_CB_INT_VAR_UNIQUE", "8080")
	defer os.Unsetenv("TEST_CB_INT_VAR_UNIQUE")
	val := getEnvAsInt("TEST_CB_INT_VAR_UNIQUE", 0)
	if val != 8080 {
		t.Errorf("expected 8080, got %d", val)
	}
}

func TestGetEnvAsInt_ReturnsDefaultForInvalidInt(t *testing.T) {
	os.Setenv("TEST_CB_INT_INVALID_VAR", "not-a-number")
	defer os.Unsetenv("TEST_CB_INT_INVALID_VAR")
	val := getEnvAsInt("TEST_CB_INT_INVALID_VAR", 99)
	if val != 99 {
		t.Errorf("expected default 99, got %d", val)
	}
}

func TestGetEnvAsInt_ReturnsDefaultForFloat(t *testing.T) {
	os.Setenv("TEST_CB_INT_FLOAT_VAR", "3.14")
	defer os.Unsetenv("TEST_CB_INT_FLOAT_VAR")
	val := getEnvAsInt("TEST_CB_INT_FLOAT_VAR", 7)
	if val != 7 {
		t.Errorf("expected default 7 for float, got %d", val)
	}
}

func TestGetEnvAsInt_NegativeValue(t *testing.T) {
	os.Setenv("TEST_CB_INT_NEG_VAR", "-5")
	defer os.Unsetenv("TEST_CB_INT_NEG_VAR")
	val := getEnvAsInt("TEST_CB_INT_NEG_VAR", 0)
	if val != -5 {
		t.Errorf("expected -5, got %d", val)
	}
}

func TestGetEnvAsInt_ZeroValue(t *testing.T) {
	os.Setenv("TEST_CB_INT_ZERO_VAR", "0")
	defer os.Unsetenv("TEST_CB_INT_ZERO_VAR")
	val := getEnvAsInt("TEST_CB_INT_ZERO_VAR", 99)
	if val != 0 {
		t.Errorf("expected 0, got %d", val)
	}
}
