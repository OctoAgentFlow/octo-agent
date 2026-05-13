SHELL := /bin/bash

.PHONY: help frontend-local api-front-local admin-front-local api-local admin-api-local admin-local backend-local local install lint format stop

STOP_PORTS := 10001 10002 3000 3001

help: ## Show available make targets
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

frontend-local: ## Run frontend server for local
	cd frontend && npm run dev

api-front-local: ## Run frontend for API side (local)
	cd frontend && npm run dev:api-front

admin-front-local: ## Run frontend for admin side (local)
	cd frontend && npm run dev:admin-front

api-local: ## Run backend API service (local)
	cd backend && APP_ENV=local APP_SERVICE=api go run ./cmd/api

admin-api-local: ## Run backend Admin API service (local)
	cd backend && APP_ENV=local APP_SERVICE=admin go run ./cmd/admin

admin-local: admin-api-local ## Alias of admin-api-local

backend-local: api-local ## Alias of api-local (local)

local: ## Print multi-terminal local commands
	@echo "Run frontend and backend services in separate terminals:"
	@echo "  make api-front-local"
	@echo "  make admin-front-local"
	@echo "  make api-local"
	@echo "  make admin-api-local"

install: ## Install frontend and backend dependencies
	cd frontend && npm install
	cd backend && go mod tidy

lint: ## Lint frontend and run backend tests
	cd frontend && npm run lint
	cd backend && go test ./...

format: ## Format frontend and backend code
	cd frontend && npm run format || true
	cd backend && gofmt -w $$(rg --files backend -g '*.go')

stop: ## Stop local API/admin/frontend listeners
	@for port in $(STOP_PORTS); do \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then \
			kill $$pids 2>/dev/null && echo "stopped port $$port"; \
		else \
			echo "nothing on port $$port"; \
		fi; \
	done
