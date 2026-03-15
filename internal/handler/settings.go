package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"webmail/internal/db"
	"webmail/internal/middleware"

	"github.com/rs/zerolog"
)

// SettingsHandler handles user preferences.
type SettingsHandler struct {
	queries *db.Queries
	log     zerolog.Logger
}

// NewSettingsHandler creates a new settings handler.
func NewSettingsHandler(queries *db.Queries, log zerolog.Logger) *SettingsHandler {
	return &SettingsHandler{queries: queries, log: log}
}

// Get handles GET /api/settings.
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	prefs, err := h.queries.GetPreferences(r.Context(), sess.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get preferences")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(prefs) //nolint:errcheck
}

// Put handles PUT /api/settings.
func (h *SettingsHandler) Put(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024)) // 64KB limit for preferences
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	// Validate it's valid JSON.
	if !json.Valid(body) {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_json"})
		return
	}

	if err := h.queries.UpsertPreferences(r.Context(), sess.Email, json.RawMessage(body)); err != nil {
		h.log.Error().Err(err).Msg("failed to save preferences")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
