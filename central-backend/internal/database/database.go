package database

import (
	"fmt"
	"time"

	"github.com/hms-fyp/central-control/internal/config"
	"github.com/hms-fyp/central-control/internal/models"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database instance
var DB *gorm.DB

// Initialize initializes the database connection and runs migrations
func Initialize(cfg *config.DatabaseConfig) error {
	var err error

	dsn := cfg.GetDSN()

	// Configure GORM logger
	gormLogger := logger.Default.LogMode(logger.Info)
	if cfg.SSLMode == "disable" {
		gormLogger = logger.Default.LogMode(logger.Warn)
	}

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

	// Set connection pool settings
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// Ping database to verify connection
	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	logrus.Info("Successfully connected to database")

	// Run migrations
	if err := RunMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}

// RunMigrations runs all database migrations
func RunMigrations() error {
	logrus.Info("Running database migrations...")

	// Enable UUID extension
	if err := DB.Exec("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"").Error; err != nil {
		return fmt.Errorf("failed to create uuid extension: %w", err)
	}

	// Auto migrate all models
	if err := DB.AutoMigrate(
		&models.Hospital{},
		&models.Requestor{},
		&models.DataAccessRequest{},
		&models.NodeAccessResponse{},
		&models.AuditLog{},
		&models.Admin{},
	); err != nil {
		return fmt.Errorf("failed to auto migrate: %w", err)
	}

	logrus.Info("Database migrations completed successfully")
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
