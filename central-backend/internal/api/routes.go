package api

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-control/internal/api/handlers"
	"github.com/hms-fyp/central-control/internal/api/middleware"
	"github.com/hms-fyp/central-control/internal/config"
	"github.com/hms-fyp/central-control/internal/services"
)

type Router struct {
	cfg             *config.Config
	authHandler     *handlers.AuthHandler
	hospitalHandler *handlers.HospitalHandler
	requestHandler  *handlers.RequestHandler
	healthHandler   *handlers.HealthHandler
	authService     *services.AuthService
}

func NewRouter(
	cfg *config.Config,
	authHandler *handlers.AuthHandler,
	hospitalHandler *handlers.HospitalHandler,
	requestHandler *handlers.RequestHandler,
	healthHandler *handlers.HealthHandler,
	authService *services.AuthService,
) *Router {
	return &Router{
		cfg:             cfg,
		authHandler:     authHandler,
		hospitalHandler: hospitalHandler,
		requestHandler:  requestHandler,
		healthHandler:   healthHandler,
		authService:     authService,
	}
}

func (r *Router) Setup() *gin.Engine {
	// Set Gin mode
	if r.cfg.App.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Global middleware
	router.Use(gin.Recovery())
	router.Use(middleware.Logger())
	router.Use(middleware.CORS())

	// Rate limiting
	rateLimiter := middleware.NewRateLimiter(100, time.Minute)
	router.Use(rateLimiter.Middleware())

	// Health endpoints (no auth required)
	router.GET("/health", r.healthHandler.HealthCheck)
	router.GET("/ready", r.healthHandler.ReadinessCheck)
	router.GET("/live", r.healthHandler.LivenessCheck)

	// Serve admin UI
	router.Static("/admin", "./web/admin")

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Public endpoints
		auth := v1.Group("/auth")
		{
			auth.POST("/admin/login", r.authHandler.AdminLogin)
			auth.POST("/hospital/login", r.authHandler.HospitalLogin)
			auth.POST("/token", r.authHandler.ClientCredentialsAuth)
		}

		// Hospital registration (public)
		v1.POST("/hospitals/register", r.hospitalHandler.RegisterHospital)

		// Node handshake (requires client credentials, handled internally)
		nodes := v1.Group("/nodes")
		{
			nodes.POST("/handshake", func(c *gin.Context) {
				// Pass authService through context for handshake handler
				c.Set("authService", r.authService)
				r.hospitalHandler.Handshake(c)
			})

			// Protected node endpoints
			protected := nodes.Use(middleware.AuthMiddleware(r.authService), middleware.HospitalOnly())
			{
				protected.GET("/status", r.hospitalHandler.GetNodeStatus)
			}
		}

		// Admin endpoints
		admin := v1.Group("/admin")
		admin.Use(middleware.AuthMiddleware(r.authService), middleware.AdminOnly())
		{
			admin.GET("/registrations", r.hospitalHandler.GetPendingRegistrations)
			admin.PUT("/registrations/:id/approve", r.hospitalHandler.ApproveRegistration)
			admin.PUT("/registrations/:id/reject", r.hospitalHandler.RejectRegistration)
			admin.GET("/hospitals", r.hospitalHandler.GetAllHospitals)
			admin.GET("/hospitals/:id", r.hospitalHandler.GetHospitalByID)
		}

		// Access request endpoints
		requests := v1.Group("/requests")
		{
			// Public request creation (can be authenticated or not)
			requests.POST("", r.requestHandler.CreateRequest)
			requests.GET("/:id", r.requestHandler.GetRequest)
			requests.GET("", r.requestHandler.ListRequests)

			// Response submission (hospital only)
			protected := requests.Use(middleware.AuthMiddleware(r.authService), middleware.HospitalOnly())
			{
				protected.POST("/:id/responses", r.requestHandler.SubmitResponse)
			}
		}
	}

	return router
}
