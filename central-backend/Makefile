.PHONY: help build run test clean docker-up docker-down docker-logs docker-rebuild migrate

# Variables
BINARY_NAME=central-control
DOCKER_COMPOSE=docker-compose
GO=go

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the Go binary
	@echo "Building $(BINARY_NAME)..."
	$(GO) build -o $(BINARY_NAME) ./cmd/server

run: ## Run the application locally
	@echo "Running $(BINARY_NAME)..."
	$(GO) run ./cmd/server/main.go

test: ## Run tests
	@echo "Running tests..."
	$(GO) test -v -race -coverprofile=coverage.out ./...

test-coverage: test ## Run tests with coverage report
	$(GO) tool cover -html=coverage.out

clean: ## Clean build artifacts
	@echo "Cleaning..."
	rm -f $(BINARY_NAME)
	rm -f coverage.out
	$(GO) clean

deps: ## Download dependencies
	@echo "Downloading dependencies..."
	$(GO) mod download
	$(GO) mod verify

tidy: ## Tidy dependencies
	@echo "Tidying dependencies..."
	$(GO) mod tidy

docker-up: ## Start all Docker services
	@echo "Starting Docker services..."
	$(DOCKER_COMPOSE) up -d

docker-down: ## Stop all Docker services
	@echo "Stopping Docker services..."
	$(DOCKER_COMPOSE) down

docker-down-volumes: ## Stop all Docker services and remove volumes
	@echo "Stopping Docker services and removing volumes..."
	$(DOCKER_COMPOSE) down -v

docker-logs: ## View logs from all services
	$(DOCKER_COMPOSE) logs -f

docker-logs-app: ## View logs from central-control service only
	$(DOCKER_COMPOSE) logs -f central-control

docker-rebuild: ## Rebuild and restart the application container
	@echo "Rebuilding application container..."
	$(DOCKER_COMPOSE) up -d --build central-control

docker-restart: ## Restart the application container
	@echo "Restarting application container..."
	$(DOCKER_COMPOSE) restart central-control

docker-ps: ## Show running containers
	$(DOCKER_COMPOSE) ps

docker-exec: ## Execute bash in the application container
	$(DOCKER_COMPOSE) exec central-control sh

db-shell: ## Open PostgreSQL shell
	$(DOCKER_COMPOSE) exec postgres-central psql -U central -d centraldb

rabbitmq-ui: ## Open RabbitMQ management UI in browser
	@echo "Opening RabbitMQ Management UI..."
	@which xdg-open > /dev/null && xdg-open http://localhost:15672 || open http://localhost:15672 || echo "Please open http://localhost:15672 in your browser"

admin-ui: ## Open admin UI in browser
	@echo "Opening Admin UI..."
	@which xdg-open > /dev/null && xdg-open http://localhost:8080/admin || open http://localhost:8080/admin || echo "Please open http://localhost:8080/admin in your browser"

nessie-ui: ## Open Nessie API docs in browser
	@echo "Opening Nessie API..."
	@which xdg-open > /dev/null && xdg-open http://localhost:19120/api/v2/config || open http://localhost:19120/api/v2/config || echo "Please open http://localhost:19120/api/v2/config in your browser"

health: ## Check application health
	@echo "Checking application health..."
	@curl -s http://localhost:8080/health | jq '.' || echo "Application not responding"

# Development helpers
dev-setup: deps ## Setup development environment
	@echo "Setting up development environment..."
	@cp -n .env.example .env || true
	@echo "Development environment ready!"

dev-start: docker-up ## Start development environment
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Development environment started!"
	@echo "Admin UI: http://localhost:8080/admin"
	@echo "API: http://localhost:8080/api/v1"
	@echo "RabbitMQ: http://localhost:15672 (guest/guest)"

dev-stop: docker-down ## Stop development environment
	@echo "Development environment stopped"

# Testing helpers
test-register: ## Test hospital registration endpoint
	@echo "Testing hospital registration..."
	curl -X POST http://localhost:8080/api/v1/hospitals/register \
		-H "Content-Type: application/json" \
		-d '{"name":"Test Hospital","email":"test@hospital.com","password":"testpass123"}'

test-admin-login: ## Test admin login endpoint
	@echo "Testing admin login..."
	curl -X POST http://localhost:8080/api/v1/auth/admin/login \
		-H "Content-Type: application/json" \
		-d '{"username":"admin","password":"admin123"}'

# Cleanup
clean-all: clean docker-down-volumes ## Clean everything including Docker volumes
	@echo "All clean!"

# Linting
lint: ## Run golangci-lint
	@which golangci-lint > /dev/null || (echo "golangci-lint not installed. Run: curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin" && exit 1)
	golangci-lint run ./...

fmt: ## Format Go code
	$(GO) fmt ./...

vet: ## Run go vet
	$(GO) vet ./...
