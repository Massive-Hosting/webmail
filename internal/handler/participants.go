package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"webmail/internal/db"
	"webmail/internal/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
)

// ParticipantsHandler manages calendar event participants stored in webmail DB
// (workaround for Stalwart not returning participants via JMAP).
type ParticipantsHandler struct {
	queries *db.Queries
	log     zerolog.Logger
}

// NewParticipantsHandler creates a new participants handler.
func NewParticipantsHandler(queries *db.Queries, log zerolog.Logger) *ParticipantsHandler {
	return &ParticipantsHandler{
		queries: queries,
		log:     log.With().Str("component", "participants-handler").Logger(),
	}
}

// Get handles GET /api/events/{eventId}/participants.
func (h *ParticipantsHandler) Get(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	eventID := chi.URLParam(r, "eventId")
	if eventID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_event_id"})
		return
	}

	participants, err := h.queries.GetEventParticipants(r.Context(), eventID, sess.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get event participants")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	writeJSON(w, http.StatusOK, participants)
}

// BatchGet handles POST /api/events/participants/batch.
func (h *ParticipantsHandler) BatchGet(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EventIDs []string `json:"eventIds"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(req.EventIDs) == 0 || len(req.EventIDs) > 500 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_event_ids"})
		return
	}

	result, err := h.queries.GetBatchEventParticipants(r.Context(), req.EventIDs, sess.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to batch get event participants")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// Put handles PUT /api/events/{eventId}/participants.
func (h *ParticipantsHandler) Put(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	eventID := chi.URLParam(r, "eventId")
	if eventID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_event_id"})
		return
	}

	var participants []db.EventParticipant
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&participants); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(participants) > 100 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"too_many_participants"})
		return
	}

	if err := h.queries.UpsertEventParticipants(r.Context(), eventID, sess.Email, participants); err != nil {
		h.log.Error().Err(err).Msg("failed to upsert event participants")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Delete handles DELETE /api/events/{eventId}/participants.
func (h *ParticipantsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	eventID := chi.URLParam(r, "eventId")
	if eventID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_event_id"})
		return
	}

	if err := h.queries.DeleteEventParticipants(r.Context(), eventID, sess.Email); err != nil {
		h.log.Error().Err(err).Msg("failed to delete event participants")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
