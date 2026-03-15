package handler

import (
	"context"
	"net/http"

	"webmail/internal/middleware"
	"webmail/internal/ws"

	"github.com/rs/zerolog"
)

// WebSocketHandler handles WebSocket upgrade requests.
type WebSocketHandler struct {
	hub            *ws.Hub
	progressRelay  *ws.ProgressRelay
	log            zerolog.Logger
}

// NewWebSocketHandler creates a new WebSocket handler.
func NewWebSocketHandler(hub *ws.Hub, progressRelay *ws.ProgressRelay, log zerolog.Logger) *WebSocketHandler {
	return &WebSocketHandler{
		hub:           hub,
		progressRelay: progressRelay,
		log:           log,
	}
}

// Upgrade handles GET /api/ws — upgrades to WebSocket.
func (h *WebSocketHandler) Upgrade(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	// Create a context that cancels when the WebSocket disconnects.
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Start EventSource subscriber for this user's JMAP state changes.
	essSub := ws.NewEventSourceSubscriber(
		h.hub,
		sess.Email,
		sess.StalwartURL,
		sess.Email,
		sess.Password,
		h.log,
	)
	go essSub.Subscribe(ctx)

	// Start Valkey progress relay for this user.
	if h.progressRelay != nil {
		go h.progressRelay.RelayForUser(ctx, sess.Email)
	}

	if err := h.hub.HandleConnection(w, r, sess.Email, sess.AccountID); err != nil {
		h.log.Error().Err(err).Str("email", sess.Email).Msg("websocket upgrade failed")
	}
}
