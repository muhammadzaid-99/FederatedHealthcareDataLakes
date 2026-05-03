package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/etl-server/internal/api"
	"github.com/hms-fyp/etl-server/internal/api/handlers"
	"github.com/hms-fyp/etl-server/internal/config"
	"github.com/hms-fyp/etl-server/internal/executor"
	"github.com/sirupsen/logrus"
)

const (
	Version     = "1.0.1"
	BuildDate   = "2026-05-03"
	Description = "ETL Server - Standalone ETL Pipeline Executor"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logrus.Fatalf("Failed to load configuration: %v", err)
	}

	// Setup logging
	logrus.SetFormatter(&logrus.JSONFormatter{})
	if cfg.Environment == "development" {
		logrus.SetLevel(logrus.DebugLevel)
	}

	logrus.WithFields(logrus.Fields{
		"version":     Version,
		"build_date":  BuildDate,
		"description": Description,
	}).Info("Starting ETL Server...")

	// Initialize executor (in-memory job store + Python script runner)
	exec := executor.NewExecutor()

	// Initialize handler
	etlHandler := handlers.NewETLHandler(exec)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())

	// Setup routes with API key protection
	api.SetupRoutes(router, etlHandler, cfg.InternalAPIKey)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logrus.Infof("ETL Server listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down ETL Server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logrus.Fatalf("Server forced to shutdown: %v", err)
	}

	logrus.Info("ETL Server stopped")
}
