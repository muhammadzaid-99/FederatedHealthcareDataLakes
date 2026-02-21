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
	queryHandler    *handlers.QueryHandler
	healthHandler   *handlers.HealthHandler
	authService     *services.AuthService
}

func NewRouter(
	cfg *config.Config,
	authHandler *handlers.AuthHandler,
	hospitalHandler *handlers.HospitalHandler,
	requestHandler *handlers.RequestHandler,
	queryHandler *handlers.QueryHandler,
	healthHandler *handlers.HealthHandler,
	authService *services.AuthService,
) *Router {
	return &Router{
		cfg:             cfg,
		authHandler:     authHandler,
		hospitalHandler: hospitalHandler,
		requestHandler:  requestHandler,
		queryHandler:    queryHandler,
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
		// ============================================================
		// PUBLIC ENDPOINTS (No Authentication Required)
		// ============================================================

		// Authentication endpoints
		auth := v1.Group("/auth")
		{
			// Central-web authentication (sets httpOnly cookies)
			auth.POST("/admin/login", r.authHandler.AdminLogin)
			auth.POST("/admin/logout", r.authHandler.AdminLogout)
			auth.POST("/hospital/login", r.authHandler.HospitalLogin)
			auth.POST("/hospital/logout", r.authHandler.HospitalLogout)
			auth.POST("/requestor/login", r.authHandler.RequestorLogin)
			auth.POST("/requestor/logout", r.authHandler.RequestorLogout)

			// Node authentication (returns JWT token for Authorization header)
			auth.POST("/node/token", r.authHandler.ClientCredentialsAuth)
		}

		// Hospital registration (public endpoint)
		v1.POST("/hospitals/register", r.hospitalHandler.RegisterHospital)

		// Requestor registration (public endpoint)
		v1.POST("/requestors/register", r.authHandler.RequestorRegister)

		// ============================================================
		// ADMIN ENDPOINTS (Cookie-based Auth - Admin Only)
		// ============================================================
		admin := v1.Group("/admin")
		admin.Use(middleware.AuthMiddleware(r.authService), middleware.AdminOnly())
		{
			// Hospital management
			admin.GET("/hospitals", r.hospitalHandler.GetAllHospitals)
			admin.GET("/hospitals/:id", r.hospitalHandler.GetHospitalByID)

			// Registration approval workflow
			admin.GET("/registrations", r.hospitalHandler.GetPendingRegistrations)
			admin.PUT("/registrations/:id/approve", r.hospitalHandler.ApproveRegistration)
			admin.PUT("/registrations/:id/reject", r.hospitalHandler.RejectRegistration)
		}

		// ============================================================
		// HOSPITAL ENDPOINTS (Cookie-based Auth - Hospital Only)
		// Part of central system - hospital staff managing their org
		// ============================================================
		hospitals := v1.Group("/hospitals")
		hospitalAuth := hospitals.Use(middleware.AuthMiddleware(r.authService), middleware.HospitalOnly())
		{
			// Hospital's own status and configuration
			hospitalAuth.GET("/me", r.hospitalHandler.GetHospitalStatus)

			// Generate client credentials for external node access
			hospitalAuth.POST("/me/generate-credentials", func(c *gin.Context) {
				c.Set("authService", r.authService)
				r.hospitalHandler.GenerateClientSecret(c)
			})
		}

		// ============================================================
		// NODE ENDPOINTS (Token-based Auth - External Systems)
		// External nodes using client_id + client_secret
		// ============================================================
		nodes := v1.Group("/nodes")
		{
			// Handshake requires client credentials validation (done in handler)
			nodes.POST("/handshake", func(c *gin.Context) {
				c.Set("authService", r.authService)
				r.hospitalHandler.Handshake(c)
			})

			// Protected node endpoints (requires JWT token from /auth/node/token)
			nodeAuth := nodes.Use(middleware.AuthMiddleware(r.authService), middleware.NodeOnly())
			{
				// Node's own status
				nodeAuth.GET("/me", r.hospitalHandler.GetNodeStatus)
			}
		}

		// ============================================================
		// DATA ACCESS REQUEST ENDPOINTS
		// ============================================================
		requests := v1.Group("/requests")
		{
			// Public request endpoints
			requests.POST("", r.requestHandler.CreateRequest)
			requests.GET("/:id", r.requestHandler.GetRequest)
			requests.GET("", r.requestHandler.ListRequests)

			// Response submission (requires authentication - nodes can respond)
			nodeRequestAuth := requests.Use(middleware.AuthMiddleware(r.authService), middleware.NodeOnly())
			{
				nodeRequestAuth.POST("/:id/responses", r.requestHandler.SubmitResponse)
			}
		}

		// ============================================================
		// REQUESTOR ENDPOINTS (Cookie-based Auth - Requestor Only)
		// For researchers to manage their data access requests
		// ============================================================
		requestor := v1.Group("/requestor")
		requestor.Use(middleware.AuthMiddleware(r.authService), middleware.RequestorOnly())
		{
			// Requestor's own profile
			requestor.GET("/me", r.requestHandler.GetRequestorProfile)

			// Requestor's data access requests
			requestor.GET("/requests", r.requestHandler.GetRequestorRequests)
			requestor.POST("/requests", r.requestHandler.CreateRequestorRequest)
			requestor.GET("/requests/:id", r.requestHandler.GetRequestorRequestByID)

			// Get active hospitals for request form
			requestor.GET("/hospitals", r.requestHandler.GetActiveHospitals)

			// ============================================================
			// QUERY ENDPOINTS (server-side query builder)
			// All queries are built server-side with validated access policies
			// ============================================================

			// Approved access responses for the query builder form
			requestor.GET("/approved-access", r.queryHandler.GetApprovedAccess)

			// Structured query execution
			requestor.POST("/query", r.queryHandler.ExecuteStructuredQuery)

			// Schema browsing (proxied through central-backend)
			requestor.GET("/schemas", r.queryHandler.GetSchemas)
			requestor.GET("/schemas/:schema/tables", r.queryHandler.GetTables)
			requestor.GET("/schemas/:schema/tables/:table/columns", r.queryHandler.GetColumns)
		}
	}

	return router
}
