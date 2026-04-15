SHELL := /bin/bash

.PHONY: help frontend-local api-front-local admin-front-local api-local admin-local backend-local local install lint format

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
	cd backend && APP_ENV=local go run ./cmd/api

admin-local: ## Run backend admin service (local)
	cd backend && APP_ENV=local go run ./cmd/admin

backend-local: api-local ## Alias of api-local (local)

local: ## Print multi-terminal local commands
	@echo "Run frontend and backend services in separate terminals:"
	@echo "  make api-front-local"
	@echo "  make admin-front-local"
	@echo "  make api-local"
	@echo "  make admin-local"

install: ## Install frontend and backend dependencies
	cd frontend && npm install
	cd backend && go mod tidy

lint: ## Lint frontend and run backend tests
	cd frontend && npm run lint
	cd backend && go test ./...

format: ## Format frontend and backend code
	cd frontend && npm run format || true
	cd backend && gofmt -w $$(rg --files backend -g '*.go')
