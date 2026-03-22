package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"webmail/internal/middleware"
)

// CallRoom represents an active call room that guests can join.
type CallRoom struct {
	ID          string    `json:"id"`
	HostEmail   string    `json:"host_email"`
	HostName    string    `json:"host_name"`
	GuestEmail  string    `json:"guest_email,omitempty"`
	GuestName   string    `json:"guest_name,omitempty"`
	Video       bool      `json:"video"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// CallRoomHandler manages call rooms for guest access.
type CallRoomHandler struct {
	mu    sync.RWMutex
	rooms map[string]*CallRoom
}

// NewCallRoomHandler creates a new call room handler.
func NewCallRoomHandler() *CallRoomHandler {
	h := &CallRoomHandler{
		rooms: make(map[string]*CallRoom),
	}
	// Periodically clean up expired rooms.
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			h.cleanup()
		}
	}()
	return h
}

func (h *CallRoomHandler) cleanup() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	for id, room := range h.rooms {
		if now.After(room.ExpiresAt) {
			delete(h.rooms, id)
		}
	}
}

func generateRoomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed")
	}
	return hex.EncodeToString(b)
}

// Create handles POST /api/call-rooms — creates a new room and returns the join URL.
func (h *CallRoomHandler) Create(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		GuestEmail string `json:"guest_email"`
		GuestName  string `json:"guest_name"`
		HostName   string `json:"host_name"`
		Video      bool   `json:"video"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid request"})
		return
	}

	if req.GuestEmail == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"guest_email is required"})
		return
	}

	room := &CallRoom{
		ID:         generateRoomID(),
		HostEmail:  sess.Email,
		HostName:   req.HostName,
		GuestEmail: req.GuestEmail,
		GuestName:  req.GuestName,
		Video:      req.Video,
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(1 * time.Hour),
	}

	h.mu.Lock()
	h.rooms[room.ID] = room
	h.mu.Unlock()

	// Build join URL from request host.
	scheme := "https"
	if strings.HasPrefix(r.Host, "localhost") || strings.HasPrefix(r.Host, "127.") {
		scheme = "http"
	}
	if fwd := r.Header.Get("X-Forwarded-Proto"); fwd != "" {
		scheme = fwd
	}
	joinURL := scheme + "://" + r.Host + "/wave/join/" + room.ID

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"room":     room,
		"join_url": joinURL,
	})
}

// Get handles GET /api/call-rooms/{id} — public, returns room info.
func (h *CallRoomHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing room id"})
		return
	}

	h.mu.RLock()
	room, ok := h.rooms[id]
	h.mu.RUnlock()

	if !ok || time.Now().After(room.ExpiresAt) {
		writeJSON(w, http.StatusNotFound, errorResponse{"room not found or expired"})
		return
	}

	// Return safe subset (no host email details for security).
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":        room.ID,
		"host_name": room.HostName,
		"video":     room.Video,
		"expires_at": room.ExpiresAt,
	})
}

// GetRoom returns a room by ID (for internal use by other handlers).
func (h *CallRoomHandler) GetRoom(id string) *CallRoom {
	h.mu.RLock()
	defer h.mu.RUnlock()
	room, ok := h.rooms[id]
	if !ok || time.Now().After(room.ExpiresAt) {
		return nil
	}
	return room
}
