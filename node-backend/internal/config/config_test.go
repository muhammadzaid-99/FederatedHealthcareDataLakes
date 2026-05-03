package config

import (
	"os"
	"strings"
	"testing"
)

// ============================================================
// DatabaseConfig.DSN
// ============================================================

func TestDatabaseConfig_DSN_BasicFormat(t *testing.T) {
	cfg := DatabaseConfig{
		Host:     "localhost",
		Port:     "5432",
		User:     "node_user",
		Password: "node_password",
		DBName:   "node_db",
		SSLMode:  "disable",
	}
	dsn := cfg.DSN()
	checks := []string{"host=localhost", "port=5432", "user=node_user", "password=node_password", "dbname=node_db", "sslmode=disable"}
	for _, check := range checks {
		if !strings.Contains(dsn, check) {
			t.Errorf("expected %q in DSN %q", check, dsn)
		}
	}
}

func TestDatabaseConfig_DSN_ContainsConnectTimeout(t *testing.T) {
	cfg := DatabaseConfig{
		Host: "localhost", Port: "5432",
		User: "u", Password: "p", DBName: "db", SSLMode: "disable",
	}
	dsn := cfg.DSN()
	if !strings.Contains(dsn, "connect_timeout=10") {
		t.Errorf("expected connect_timeout=10 in DSN, got: %s", dsn)
	}
}

func TestDatabaseConfig_DSN_DifferentHosts(t *testing.T) {
	hosts := []string{"localhost", "db.internal", "10.0.0.1", "postgres.svc.cluster.local"}
	for _, host := range hosts {
		cfg := DatabaseConfig{Host: host, Port: "5432", User: "u", Password: "p", DBName: "db", SSLMode: "disable"}
		dsn := cfg.DSN()
		if !strings.Contains(dsn, "host="+host) {
			t.Errorf("expected host=%s in DSN, got: %s", host, dsn)
		}
	}
}

func TestDatabaseConfig_DSN_DifferentPorts(t *testing.T) {
	ports := []string{"5432", "5433", "5434", "5435"}
	for _, port := range ports {
		cfg := DatabaseConfig{Host: "localhost", Port: port, User: "u", Password: "p", DBName: "db", SSLMode: "disable"}
		dsn := cfg.DSN()
		if !strings.Contains(dsn, "port="+port) {
			t.Errorf("expected port=%s in DSN, got: %s", port, dsn)
		}
	}
}

func TestDatabaseConfig_DSN_SSLModeRequire(t *testing.T) {
	cfg := DatabaseConfig{
		Host: "db.example.com", Port: "5432",
		User: "u", Password: "p", DBName: "db", SSLMode: "require",
	}
	dsn := cfg.DSN()
	if !strings.Contains(dsn, "sslmode=require") {
		t.Errorf("expected sslmode=require in DSN, got: %s", dsn)
	}
}

func TestDatabaseConfig_DSN_SpecialCharsInPassword(t *testing.T) {
	cfg := DatabaseConfig{
		Host: "localhost", Port: "5432",
		User: "u", Password: "p@ssw0rd!", DBName: "db", SSLMode: "disable",
	}
	dsn := cfg.DSN()
	if !strings.Contains(dsn, "p@ssw0rd!") {
		t.Errorf("expected special char password in DSN, got: %s", dsn)
	}
}

// ============================================================
// getEnv helper
// ============================================================

func TestGetEnv_NB_ReturnsDefaultWhenUnset(t *testing.T) {
	os.Unsetenv("TEST_NB_UNIQUE_VAR_ABC")
	val := getEnv("TEST_NB_UNIQUE_VAR_ABC", "default_nb")
	if val != "default_nb" {
		t.Errorf("expected default_nb, got %s", val)
	}
}

func TestGetEnv_NB_ReturnsSetValue(t *testing.T) {
	os.Setenv("TEST_NB_UNIQUE_VAR_ABC", "custom_nb")
	defer os.Unsetenv("TEST_NB_UNIQUE_VAR_ABC")
	val := getEnv("TEST_NB_UNIQUE_VAR_ABC", "default_nb")
	if val != "custom_nb" {
		t.Errorf("expected custom_nb, got %s", val)
	}
}

func TestGetEnv_NB_EmptyEnvUsesDefault(t *testing.T) {
	os.Unsetenv("TEST_NB_UNSET_VAR_XYZ")
	val := getEnv("TEST_NB_UNSET_VAR_XYZ", "fallback_nb")
	if val != "fallback_nb" {
		t.Errorf("expected fallback_nb, got %s", val)
	}
}

func TestGetEnv_NB_MultipleVars(t *testing.T) {
	pairs := map[string]string{
		"TEST_NB_VAR1": "value1",
		"TEST_NB_VAR2": "value2",
		"TEST_NB_VAR3": "value3",
	}
	for k, v := range pairs {
		os.Setenv(k, v)
		defer os.Unsetenv(k)
	}
	for k, expected := range pairs {
		got := getEnv(k, "wrong")
		if got != expected {
			t.Errorf("key %s: expected %s, got %s", k, expected, got)
		}
	}
}

// ============================================================
// Config structure defaults via Load
// ============================================================

func TestLoad_DefaultPort(t *testing.T) {
	// Unset so defaults apply
	os.Unsetenv("PORT")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.App.Port == "" {
		t.Error("expected default port to be set")
	}
}

func TestLoad_DefaultDatabaseHost(t *testing.T) {
	os.Unsetenv("NODE_DB_HOST")
	cfg, _ := Load()
	if cfg.Database.Host == "" {
		t.Error("expected default DB host to be set")
	}
}

func TestLoad_DefaultJWTSecret(t *testing.T) {
	os.Unsetenv("NODE_JWT_SECRET")
	cfg, _ := Load()
	if cfg.JWT.Secret == "" {
		t.Error("expected default JWT secret to be set")
	}
}

func TestLoad_DefaultCentralURL(t *testing.T) {
	os.Unsetenv("CENTRAL_BACKEND_URL")
	cfg, _ := Load()
	if cfg.Central.BaseURL == "" {
		t.Error("expected default Central BaseURL to be set")
	}
}

func TestLoad_CustomPortFromEnv(t *testing.T) {
	os.Setenv("PORT", "9999")
	defer os.Unsetenv("PORT")
	cfg, _ := Load()
	if cfg.App.Port != "9999" {
		t.Errorf("expected port 9999, got %s", cfg.App.Port)
	}
}

func TestLoad_CustomDBHostFromEnv(t *testing.T) {
	os.Setenv("NODE_DB_HOST", "my-custom-db")
	defer os.Unsetenv("NODE_DB_HOST")
	cfg, _ := Load()
	if cfg.Database.Host != "my-custom-db" {
		t.Errorf("expected my-custom-db, got %s", cfg.Database.Host)
	}
}

func TestLoad_ETLServerDefaults(t *testing.T) {
	os.Unsetenv("ETL_SERVER_URL")
	os.Unsetenv("ETL_INTERNAL_API_KEY")
	cfg, _ := Load()
	if cfg.ETLServer.URL == "" {
		t.Error("expected ETL server URL default")
	}
	if cfg.ETLServer.InternalAPIKey == "" {
		t.Error("expected ETL server API key default")
	}
}
