.PHONY: run-api run-admin build-api build-admin test
run-api:
	go run ./cmd/api

run-admin:
	go run ./cmd/admin

build-api:
	go build -o bin/api ./cmd/api

build-admin:
	go build -o bin/admin ./cmd/admin

test:
	go test ./...
