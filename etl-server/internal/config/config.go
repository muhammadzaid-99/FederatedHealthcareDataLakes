package config

import (
	"os"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the ETL server
type Config struct {
	Port           string
	Environment    string
	InternalAPIKey string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Try to load .env file (ignore error if not exists)
	_ = godotenv.Load()

	cfg := &Config{
		Port:           getEnv("ETL_SERVER_PORT", "9091"),
		Environment:    getEnv("ETL_SERVER_ENV", "development"),
		InternalAPIKey: getEnv("ETL_INTERNAL_API_KEY", ""),
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
