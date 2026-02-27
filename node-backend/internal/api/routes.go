package api

import (
	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/node-backend/internal/api/handlers"
	"github.com/hms-fyp/node-backend/internal/api/middleware"
	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/services"
)

type Router struct {
	cfg                *config.Config
	authHandler        *handlers.AuthHandler
	nodeHandler        *handlers.NodeHandler
	etlHandler         *handlers.ETLHandler
	dataRequestHandler *handlers.DataRequestHandler
	authService        *services.AuthService
	tokenService       *services.TokenService
}

func NewRouter(
	cfg *config.Config,
	authHandler *handlers.AuthHandler,
	nodeHandler *handlers.NodeHandler,
	etlHandler *handlers.ETLHandler,
	dataRequestHandler *handlers.DataRequestHandler,
	authService *services.AuthService,
	tokenService *services.TokenService,
) *Router {
	return &Router{
		cfg:                cfg,
		authHandler:        authHandler,
		nodeHandler:        nodeHandler,
		etlHandler:         etlHandler,
		dataRequestHandler: dataRequestHandler,
		authService:        authService,
		tokenService:       tokenService,
	}
}

func (r *Router) Setup() *gin.Engine {
	if r.cfg.App.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.CORS())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Public endpoints
		auth := v1.Group("/auth")
		{
			auth.POST("/login", r.authHandler.Login)
			auth.POST("/register", r.authHandler.Register)
		}

		// Protected endpoints (require node-web user authentication)
		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware(r.authService))
		{
			// Node configuration (from node-web UI)
			protected.POST("/config", r.nodeHandler.SaveConfig)

			// Handshake with central-backend (after config is saved)
			protected.POST("/handshake", r.nodeHandler.Handshake)

			// Node status
			protected.GET("/node/status", r.nodeHandler.GetNodeStatus)

			// Refresh status from central-backend
			protected.POST("/node/refresh", r.nodeHandler.RefreshStatus)

			// Messages (legacy RabbitMQ — kept for historical message viewing)
			protected.GET("/messages", r.nodeHandler.GetMessages)

			// ETL Configuration
			etl := protected.Group("/etl")
			{
				// Configuration management
				etl.POST("/config", r.etlHandler.SaveConfig)
				etl.GET("/config", r.etlHandler.GetConfig)
				etl.POST("/test-connection", r.etlHandler.TestConnection)

				// Scheduler control
				etl.POST("/scheduler/start", r.etlHandler.StartScheduler)
				etl.POST("/scheduler/stop", r.etlHandler.StopScheduler)
				etl.GET("/scheduler/status", r.etlHandler.GetSchedulerStatus)

				// Job management
				etl.POST("/jobs/run", r.etlHandler.RunJob)
				etl.GET("/jobs", r.etlHandler.GetJobs)
				etl.GET("/jobs/:id", r.etlHandler.GetJob)
			}

			// Data Request Management
			dataRequests := protected.Group("/data-requests")
			{
				dataRequests.GET("", r.dataRequestHandler.ListRequests)
				dataRequests.GET("/:id", r.dataRequestHandler.GetRequest)
				dataRequests.POST("/:id/approve", r.dataRequestHandler.ApproveRequest)
				dataRequests.POST("/:id/reject", r.dataRequestHandler.RejectRequest)
			}

			// TODO: Add proxy endpoints to central-backend here
			// These will use the tokenService to get access tokens
		}
	}

	return router
}
