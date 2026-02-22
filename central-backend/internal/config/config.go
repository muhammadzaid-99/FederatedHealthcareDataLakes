package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
)

type Config struct {
	Database DatabaseConfig
	RabbitMQ RabbitMQConfig
	Nessie   NessieConfig
	App      AppConfig
	Admin    AdminConfig
	Logging  LoggingConfig
	Proxy    ProxyConfig
}

type DatabaseConfig struct {
	Host     string
	Port     int
	Name     string
	User     string
	Password string
	SSLMode  string
}

type RabbitMQConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	MgmtPort int
}

type NessieConfig struct {
	Endpoint      string
	DefaultBranch string
}

type AppConfig struct {
	Port              int
	Environment       string
	JWTSecret         string
	JWTExpirationTime time.Duration
}

type AdminConfig struct {
	Username string
	Password string
}

type LoggingConfig struct {
	Level  string
	Format string
}

// ProxyConfig holds settings for communicating with the central-proxy
type ProxyConfig struct {
	Endpoint       string // e.g. http://central-proxy:8081
	InternalAPIKey string // shared secret to authenticate with proxy
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Try to load .env file (ignore error if not exists)
	_ = godotenv.Load()

	cfg := &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvAsInt("DB_PORT", 5432),
			Name:     getEnv("DB_NAME", "centraldb"),
			User:     getEnv("DB_USER", "central"),
			Password: getEnv("DB_PASSWORD", "centralpass"),
			SSLMode:  getEnv("DB_SSL_MODE", "disable"),
		},
		RabbitMQ: RabbitMQConfig{
			Host:     getEnv("RABBITMQ_HOST", "localhost"),
			Port:     getEnvAsInt("RABBITMQ_PORT", 5672),
			User:     getEnv("RABBITMQ_USER", "guest"),
			Password: getEnv("RABBITMQ_PASSWORD", "guest"),
			MgmtPort: getEnvAsInt("RABBITMQ_MGMT_PORT", 15672),
		},
		Nessie: NessieConfig{
			Endpoint:      getEnv("NESSIE_ENDPOINT", "http://localhost:19120"),
			DefaultBranch: getEnv("NESSIE_DEFAULT_BRANCH", "main"),
		},
		App: AppConfig{
			Port:              getEnvAsInt("APP_PORT", 8080),
			Environment:       getEnv("APP_ENV", "development"),
			JWTSecret:         getEnv("JWT_SECRET", "change-me-in-production"),
			JWTExpirationTime: time.Hour * time.Duration(getEnvAsInt("JWT_EXPIRATION_HOURS", 24)),
		},
		Admin: AdminConfig{
			Username: getEnv("ADMIN_USERNAME", "admin"),
			Password: getEnv("ADMIN_PASSWORD", "admin123"),
		},
		Logging: LoggingConfig{
			Level:  getEnv("LOG_LEVEL", "info"),
			Format: getEnv("LOG_FORMAT", "json"),
		},
		Proxy: ProxyConfig{
			Endpoint:       getEnv("PROXY_URL", "http://localhost:8081"),
			InternalAPIKey: getEnv("PROXY_INTERNAL_API_KEY", "dev-internal-api-key-change-in-production"),
		},
	}

	return cfg, cfg.Validate()
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if c.Database.Host == "" {
		return fmt.Errorf("database host is required")
	}
	if c.RabbitMQ.Host == "" {
		return fmt.Errorf("rabbitmq host is required")
	}
	if c.Nessie.Endpoint == "" {
		return fmt.Errorf("nessie endpoint is required")
	}
	if c.App.JWTSecret == "" || c.App.JWTSecret == "change-me-in-production" {
		if c.App.Environment == "production" {
			return fmt.Errorf("JWT secret must be changed in production")
		}
		logrus.Warn("Using default JWT secret - NOT suitable for production")
	}
	return nil
}

// GetDSN returns the PostgreSQL DSN connection string
func (c *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.Name, c.SSLMode,
	)
}

// GetAMQPURL returns the RabbitMQ connection URL
func (c *RabbitMQConfig) GetAMQPURL() string {
	return fmt.Sprintf(
		"amqp://%s:%s@%s:%d/",
		c.User, c.Password, c.Host, c.Port,
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
