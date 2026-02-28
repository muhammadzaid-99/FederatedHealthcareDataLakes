package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	App       AppConfig
	Database  DatabaseConfig
	Central   CentralConfig
	JWT       JWTConfig
	RabbitMQ  RabbitMQConfig
	ETLServer ETLServerConfig
}

// ETLServerConfig holds settings for communicating with the standalone ETL server
type ETLServerConfig struct {
	URL            string // e.g. http://localhost:9091
	InternalAPIKey string // shared secret to authenticate with ETL server
}

type AppConfig struct {
	Port        string
	Environment string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type CentralConfig struct {
	BaseURL string // Central backend URL for API calls
}

type JWTConfig struct {
	Secret string
}

type RabbitMQConfig struct {
	URL string
}

func Load() (*Config, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	cfg := &Config{
		App: AppConfig{
			Port:        getEnv("NODE_PORT", "9090"),
			Environment: getEnv("NODE_ENV", "development"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("NODE_DB_HOST", "localhost"),
			Port:     getEnv("NODE_DB_PORT", "5434"),
			User:     getEnv("NODE_DB_USER", "node_user"),
			Password: getEnv("NODE_DB_PASSWORD", "node_password"),
			DBName:   getEnv("NODE_DB_NAME", "node_db"),
			SSLMode:  getEnv("NODE_DB_SSLMODE", "disable"),
		},
		Central: CentralConfig{
			BaseURL: getEnv("CENTRAL_BACKEND_URL", "http://localhost:8080"),
		},
		JWT: JWTConfig{
			Secret: getEnv("NODE_JWT_SECRET", "node-jwt-secret-change-in-production"),
		},
		// RabbitMQ config loading disabled — no longer used
		RabbitMQ: RabbitMQConfig{
			URL: "", // was: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
		},
		ETLServer: ETLServerConfig{
			URL:            getEnv("ETL_SERVER_URL", "http://localhost:9091"),
			InternalAPIKey: getEnv("ETL_INTERNAL_API_KEY", ""),
		},
	}

	return cfg, nil
}

func (c *DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode,
	)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
