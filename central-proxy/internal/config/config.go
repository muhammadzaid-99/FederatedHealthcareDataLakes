package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
)

// Config holds all configuration for the central proxy
type Config struct {
	// Proxy server settings
	Port        int
	Environment string
	LogLevel    string

	// Database connection (central-backend's PostgreSQL)
	Database DatabaseConfig

	// Nessie server settings
	Nessie NessieConfig

	// Cache settings
	Cache CacheConfig

	// Internal API key for authenticating requests from central-backend
	InternalAPIKey string
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Host     string
	Port     int
	Name     string
	User     string
	Password string
	SSLMode  string
}

// NessieConfig holds Nessie catalog server settings
type NessieConfig struct {
	Endpoint string
}

// CacheConfig holds cache settings
type CacheConfig struct {
	// TTL in seconds for credential cache
	CredentialTTLSeconds int
	// TTL in seconds for hospital lookup cache
	HospitalTTLSeconds int
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Try to load .env file (ignore error if not exists)
	_ = godotenv.Load()

	// Heroku sets PORT dynamically; fall back to PROXY_PORT for local dev
	port := getEnvAsInt("PORT", 0)
	if port == 0 {
		port = getEnvAsInt("PROXY_PORT", 8081)
	}

	cfg := &Config{
		Port:        port,
		Environment: getEnv("PROXY_ENV", "development"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),

		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvAsInt("DB_PORT", 5432),
			Name:     getEnv("DB_NAME", "centraldb"),
			User:     getEnv("DB_USER", "central"),
			Password: getEnv("DB_PASSWORD", "centralpass"),
			SSLMode:  getEnv("DB_SSL_MODE", "disable"),
		},

		Nessie: NessieConfig{
			Endpoint: getEnv("NESSIE_ENDPOINT", "http://localhost:19120"),
		},

		Cache: CacheConfig{
			CredentialTTLSeconds: getEnvAsInt("CACHE_CREDENTIAL_TTL", 300), // 5 minutes default
			HospitalTTLSeconds:   getEnvAsInt("CACHE_HOSPITAL_TTL", 600),   // 10 minutes default
		},

		InternalAPIKey: getEnv("INTERNAL_API_KEY", ""),
	}

	return cfg, cfg.Validate()
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if c.Database.Host == "" {
		return fmt.Errorf("database host is required")
	}
	if c.Nessie.Endpoint == "" {
		return fmt.Errorf("nessie endpoint is required")
	}
	return nil
}

// GetDSN returns the PostgreSQL DSN connection string
func (c *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s connect_timeout=10",
		c.Host, c.Port, c.User, c.Password, c.Name, c.SSLMode,
	)
}

// Helper functions
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		logrus.Warnf("Invalid integer value for %s: %s, using default: %d", key, valueStr, defaultValue)
		return defaultValue
	}
	return value
}
