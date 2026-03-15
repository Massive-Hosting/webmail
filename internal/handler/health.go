package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HealthHandler provides health check endpoints.
type HealthHandler struct {
	dbPool *pgxpool.Pool
}

// NewHealthHandler creates a new health handler.
func NewHealthHandler(dbPool *pgxpool.Pool) *HealthHandler {
	return &HealthHandler{dbPool: dbPool}
}

// Liveness handles GET /healthz.
func (h *HealthHandler) Liveness(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
}

// Readiness handles GET /readyz — checks DB connectivity.
func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := h.dbPool.Ping(ctx); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"unhealthy","reason":"database_unreachable"}`)) //nolint:errcheck
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
}
