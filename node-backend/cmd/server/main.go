package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hms-fyp/node-backend/internal/api"
	"github.com/hms-fyp/node-backend/internal/api/handlers"
	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/database"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/hms-fyp/node-backend/internal/services"
	"github.com/sirupsen/logrus"
)

const (
	Version     = "1.0.0"
	BuildDate   = "2025-11-22"
	Description = "Hospital Node Backend - Middleware for Node Web"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logrus.Fatalf("Failed to load configuration: %v", err)
	}

	// Setup logging
	logrus.SetFormatter(&logrus.JSONFormatter{})
	if cfg.App.Environment == "development" {
		logrus.SetLevel(logrus.DebugLevel)
	}

	logrus.WithFields(logrus.Fields{
		"version":     Version,
		"build_date":  BuildDate,
		"description": Description,
	}).Info("Starting Node Backend...")

	// Initialize database
	if err := database.Initialize(&cfg.Database); err != nil {
		logrus.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	logrus.Info("Database initialized successfully")

	// Initialize services
	authService := services.NewAuthService(cfg)
	tokenService := services.NewTokenService(cfg)
	rabbitMQService := services.NewRabbitMQService(cfg)
	etlService := services.NewETLService(database.DB)
	centralAPIService := services.NewCentralAPIService(cfg, tokenService)

	// Get ETL config for MinIO credentials (needed for STS)
	var etlConfig models.ETLConfig
	if err := database.DB.First(&etlConfig).Error; err != nil {
		logrus.Warn("ETL config not found, data request service will use defaults")
	}
	dataRequestService := services.NewDataRequestService(
		database.DB,
		etlConfig.MinioEndpoint,
		etlConfig.MinioAccessKey,
		etlConfig.MinioSecretKey,
		centralAPIService,
	)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	nodeHandler := handlers.NewNodeHandler(cfg, rabbitMQService)
	etlHandler := handlers.NewETLHandler(etlService)
	dataRequestHandler := handlers.NewDataRequestHandler(dataRequestService)

	// Check if node is already configured and start RabbitMQ listener
	go func() {
		time.Sleep(2 * time.Second) // Give database time to initialize

		var nodeConfig models.NodeConfig
		if err := database.DB.First(&nodeConfig).Error; err == nil {
			// Node is configured
			if nodeConfig.AccessToken != "" && nodeConfig.QueueName != "" {
				logrus.Info("Node already configured, attempting to start RabbitMQ listener...")

				// Connect to RabbitMQ
				if err := rabbitMQService.Connect(cfg.RabbitMQ.URL); err != nil {
					logrus.Errorf("Failed to connect to RabbitMQ on startup: %v", err)
				} else {
					// Start listening
					if err := rabbitMQService.StartListening(nodeConfig.QueueName); err != nil {
						logrus.Errorf("Failed to start RabbitMQ listener on startup: %v", err)
					} else {
						logrus.Infof("Successfully started RabbitMQ listener for queue: %s", nodeConfig.QueueName)
					}
				}
			} else {
				logrus.Info("Node configured but handshake not completed yet")
			}
		} else {
			logrus.Info("Node not configured yet, skipping RabbitMQ listener startup")
		}
	}()

	// Setup router
	routerInstance := api.NewRouter(cfg, authHandler, nodeHandler, etlHandler, dataRequestHandler, authService, tokenService)
	router := routerInstance.Setup()

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.App.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logrus.Infof("Server listening on :%s", cfg.App.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logrus.Fatalf("Server forced to shutdown: %v", err)
	}

	logrus.Info("Server stopped")
}
