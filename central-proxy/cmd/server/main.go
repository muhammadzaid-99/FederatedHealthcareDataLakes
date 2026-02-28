package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-proxy/internal/api"
	"github.com/hms-fyp/central-proxy/internal/config"
	"github.com/hms-fyp/central-proxy/internal/database"
	"github.com/hms-fyp/central-proxy/internal/iceberg"
	"github.com/hms-fyp/central-proxy/internal/proxy"
	"github.com/hms-fyp/central-proxy/internal/services"
	"github.com/sirupsen/logrus"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logrus.Fatalf("Failed to load configuration: %v", err)
	}

	// Configure logging
	setupLogging(cfg.LogLevel)

	logrus.Info("Starting Central Proxy Service")
	logrus.Infof("Environment: %s", cfg.Environment)
	logrus.Infof("Nessie Endpoint: %s", cfg.Nessie.Endpoint)

	// Initialize database connection (read-only to central-backend's DB)
	if err := database.Initialize(&cfg.Database); err != nil {
		logrus.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Initialize services
	credService := services.NewCredentialService(database.GetDB(), &cfg.Cache)

	// Initialize Trino service (optional - will fail gracefully if Trino is not available)
	var trinoService *services.TrinoService
	trinoHost := getEnv("TRINO_HOST", "trino")
	trinoPortStr := getEnv("TRINO_PORT", "8080")
	trinoPort, err := strconv.Atoi(trinoPortStr)
	if err != nil {
		logrus.Warnf("Invalid TRINO_PORT value: %v", err)
		trinoPort = 8080
	}
	trinoService, err = services.NewTrinoService(trinoHost, trinoPort)
	if err != nil {
		logrus.Warnf("Failed to connect to Trino (queries will be unavailable): %v", err)
	} else {
		logrus.Info("Connected to Trino successfully")
		defer trinoService.Close()
	}

	// Initialize Iceberg Catalog (Hybrid Pointer implementation)
	icebergCatalog := iceberg.NewIcebergCatalog(cfg.Nessie.Endpoint, credService)

	// Initialize S3 data router
	s3Router := proxy.NewS3DataRouter(credService)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(corsMiddleware())
	router.Use(loggingMiddleware())

	// Setup routes
	api.SetupRoutes(router, icebergCatalog, s3Router, credService, trinoService, cfg.InternalAPIKey)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		logrus.Infof("Central Proxy listening on port %d", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down Central Proxy...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logrus.Errorf("Server forced to shutdown: %v", err)
	}

	logrus.Info("Central Proxy stopped")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func setupLogging(level string) {
	logrus.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})

	switch level {
	case "debug":
		logrus.SetLevel(logrus.DebugLevel)
	case "info":
		logrus.SetLevel(logrus.InfoLevel)
	case "warn":
		logrus.SetLevel(logrus.WarnLevel)
	case "error":
		logrus.SetLevel(logrus.ErrorLevel)
	default:
		logrus.SetLevel(logrus.InfoLevel)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func loggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		logrus.WithFields(logrus.Fields{
			"status":  status,
			"method":  c.Request.Method,
			"path":    path,
			"latency": latency,
			"ip":      c.ClientIP(),
		}).Info("Request processed")
	}
}
