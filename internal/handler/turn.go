package handler

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"webmail/internal/middleware"
)

const turnCredentialTTL = 86400 // 24 hours

// TURNHandler provides time-limited TURN credentials for WebRTC.
type TURNHandler struct {
	secret  string
	servers []string
}

// NewTURNHandler creates a new TURN credential handler.
func NewTURNHandler(secret, servers string) *TURNHandler {
	var serverList []string
	for _, s := range strings.Split(servers, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			serverList = append(serverList, s)
		}
	}
	return &TURNHandler{secret: secret, servers: serverList}
}

// Credentials handles GET /api/turn/credentials.
// Returns time-limited TURN credentials using coturn's HMAC-SHA1 algorithm.
func (h *TURNHandler) Credentials(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, h.generateCredentials(sess.Email))
}

// GuestCredentials handles GET /api/call-rooms/{id}/turn — public TURN for guests.
func (h *TURNHandler) GuestCredentials(roomHandler *CallRoomHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := r.PathValue("id")
		room := roomHandler.GetRoom(roomID)
		if room == nil {
			writeJSON(w, http.StatusNotFound, errorResponse{"room not found or expired"})
			return
		}
		writeJSON(w, http.StatusOK, h.generateCredentials("guest-"+roomID))
	}
}

func (h *TURNHandler) generateCredentials(identity string) map[string]interface{} {
	expiry := time.Now().Add(turnCredentialTTL * time.Second).Unix()
	username := fmt.Sprintf("%d:%s", expiry, identity)

	mac := hmac.New(sha1.New, []byte(h.secret))
	mac.Write([]byte(username))
	password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	iceServers := []map[string]interface{}{
		{"urls": "stun:stun.l.google.com:19302"},
	}
	for _, server := range h.servers {
		iceServers = append(iceServers, map[string]interface{}{
			"urls":       server,
			"username":   username,
			"credential": password,
		})
	}

	return map[string]interface{}{
		"iceServers": iceServers,
		"ttl":        turnCredentialTTL,
	}
}
