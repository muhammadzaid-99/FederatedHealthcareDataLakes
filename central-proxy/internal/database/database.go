package database

import (
	"fmt"
	"time"

	"github.com/hms-fyp/central-proxy/internal/config"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database instance
var DB *gorm.DB

// Initialize initializes the database connection (read-only access to central-backend's DB)
func Initialize(cfg *config.DatabaseConfig) error {
	var err error

	dsn := cfg.GetDSN()

	// Configure GORM logger
	gormLogger := logger.Default.LogMode(logger.Warn)

	// Open database connection with retry logic
	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
			Logger: gormLogger,
			NowFunc: func() time.Time {
				return time.Now().UTC()
			},
		})

		if err == nil {
			break
		}

		logrus.Warnf("Failed to connect to database (attempt %d/%d): %v", i+1, maxRetries, err)
		time.Sleep(time.Second * 5)
	}

	if err != nil {
		return fmt.Errorf("failed to connect to database after %d attempts: %w", maxRetries, err)
	}

	// Get underlying SQL DB to configure connection pool
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get database instance: %w", err)
	}

	// Set connection pool settings (smaller for proxy - it's read-only)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// Ping database to verify connection
	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	logrus.Info("Successfully connected to central database (read-only mode)")

	return nil
}

// Close closes the database connection
func Close() error {
	if DB == nil {
		return nil
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}

	return sqlDB.Close()
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return DB
}
