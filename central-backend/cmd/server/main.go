package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hms-fyp/central-control/internal/api"
	"github.com/hms-fyp/central-control/internal/api/handlers"
	"github.com/hms-fyp/central-control/internal/config"
	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/services"
	"github.com/sirupsen/logrus"
)

// Version information - update this with each deployment
const (
	Version     = "5"
	BuildDate   = "2025-11-22"
	Description = "Federated Hospital Data Lake - Central Control Plane"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logrus.Fatalf("Failed to load configuration: %v", err)
	}

	// Setup logging
	setupLogging(cfg)

	// Print version information
	logrus.WithFields(logrus.Fields{
		"version":     Version,
		"build_date":  BuildDate,
		"description": Description,
	}).Info("Starting Central Control Plane...")

	logrus.Infof("=== HMS Federated Data Lake - Central Backend v%s ===", Version)

	// Initialize database
	if err := database.Initialize(&cfg.Database); err != nil {
		logrus.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Initialize services
	authService := services.NewAuthService(cfg)
	auditService := services.NewAuditService()
	nessieService := services.NewNessieService(cfg)

	// RabbitMQ removed — nodes now fetch requests on demand via HTTP REST.
	// rabbitMQService := services.NewRabbitMQService(cfg)
	// if err := rabbitMQService.Connect(); err != nil {
	// 	logrus.Warnf("Failed to connect to RabbitMQ: %v (continuing without RabbitMQ)", err)
	// 	rabbitMQService = nil
	// } else {
	// 	defer rabbitMQService.Close()
	// }

	// Initialize business services
	hospitalService := services.NewHospitalService(cfg, authService, nessieService, auditService)
	requestService := services.NewRequestService(auditService)
	queryBuilderService := services.NewQueryBuilderService(cfg.Proxy.Endpoint, cfg.Proxy.InternalAPIKey)

	// Initialize default admin
	if err := authService.InitializeDefaultAdmin(); err != nil {
		logrus.Warnf("Failed to initialize default admin: %v", err)
	} else {
		logrus.Info("Default admin initialized successfully")
	}

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, hospitalService)
	hospitalHandler := handlers.NewHospitalHandler(hospitalService, auditService)
	requestHandler := handlers.NewRequestHandler(requestService, auditService)
	queryHandler := handlers.NewQueryHandler(queryBuilderService, auditService)
	healthHandler := handlers.NewHealthHandler(nessieService, nil)
	requestorAdminHandler := handlers.NewRequestorAdminHandler(authService, auditService)

	// Setup router
	router := api.NewRouter(
		cfg,
		authHandler,
		hospitalHandler,
		requestHandler,
		queryHandler,
		healthHandler,
		requestorAdminHandler,
		authService,
	)
	ginEngine := router.Setup()

	// Create HTTP server
	addr := fmt.Sprintf(":%d", cfg.App.Port)
	server := &http.Server{
		Addr:           addr,
		Handler:        ginEngine,
		ReadTimeout:    15 * time.Second,
		WriteTimeout:   15 * time.Second,
		IdleTimeout:    60 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB
	}

	// Start server in goroutine
	go func() {
		// Print version information
		logrus.WithFields(logrus.Fields{
			"version":     Version,
			"build_date":  BuildDate,
			"description": Description,
		}).Infof("Server listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logrus.Errorf("Server forced to shutdown: %v", err)
	}

	logrus.Info("Server stopped gracefully")
}

func setupLogging(cfg *config.Config) {
	// Set log level
	level, err := logrus.ParseLevel(cfg.Logging.Level)
	if err != nil {
		level = logrus.InfoLevel
	}
	logrus.SetLevel(level)

	// Set log format
	if cfg.Logging.Format == "json" {
		logrus.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
		})
	} else {
		logrus.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: time.RFC3339,
		})
	}

	// Set output
	logrus.SetOutput(os.Stdout)
}
