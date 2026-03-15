# Webmail - Development Commands

set dotenv-load

# Default: show available commands
default:
    @just --list

# --- Build ---

# Build Go backend
build:
    go build ./...

# Build frontend
build-ui:
    cd web && npm run build

# Build everything
build-all: build build-ui

# --- Test ---

# Run all tests (Go + Vitest)
test: test-go test-ui

# Run Go tests
test-go:
    go test ./... -v

# Run Go tests with race detector
test-go-race:
    go test ./... -v -race

# Run frontend unit tests (Vitest)
test-ui:
    cd web && npx vitest run

# Run frontend tests in watch mode
test-ui-watch:
    cd web && npx vitest

# Run Playwright E2E tests
test-e2e:
    cd web && npx playwright test

# Run Playwright E2E tests with UI
test-e2e-ui:
    cd web && npx playwright test --ui

# Run all tests including E2E
test-all: test test-e2e

# --- Lint & Check ---

# Run Go vet
vet:
    go vet ./...

# TypeScript type check
typecheck:
    cd web && npx tsc --noEmit

# Run all checks (build + vet + typecheck + tests)
check: build vet typecheck test

# --- Database ---

# Run database migrations
migrate:
    go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "${WEBMAIL_DATABASE_URL}" up

# Reset database (drop all tables and re-migrate)
reset-db:
    go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "${WEBMAIL_DATABASE_URL}" down-to 0
    go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "${WEBMAIL_DATABASE_URL}" up

# Show migration status
migrate-status:
    go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "${WEBMAIL_DATABASE_URL}" status

# --- Dev ---

# Start Go backend (dev mode)
dev:
    go run ./cmd/webmail-api

# Start frontend dev server (Vite)
dev-ui:
    cd web && NODE_OPTIONS="--max-http-header-size=65536" npm run dev

# Install frontend dependencies
install-ui:
    cd web && npm install

# --- Docker ---

# Build Docker image
docker-build:
    docker build -t webmail:latest .

# --- Seed ---

# Seed test data into Stalwart
seed:
    go run ./cmd/seed

# Seed test data (clean first)
seed-clean:
    go run ./cmd/seed -clean

# --- Helpers ---

# Connect to webmail database
db:
    psql "${WEBMAIL_DATABASE_URL}"

# Show current .env config
env:
    @cat .env
