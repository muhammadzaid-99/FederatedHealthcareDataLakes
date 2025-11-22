package database

import (
	"fmt"

	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Initialize(cfg *config.DatabaseConfig) error {
	var err error

	// Connect to PostgreSQL
	// Use Silent mode to avoid verbose logging
	DB, err = gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Auto-migrate models
	if err := DB.AutoMigrate(
		&models.NodeConfig{},
		&models.User{},
		&models.Message{},
		&models.ETLConfig{},
		&models.ETLJob{},
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	return nil
}

func Close() error {
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func GetDB() *gorm.DB {
	return DB
}
