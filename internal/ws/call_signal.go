package ws

import "encoding/json"

// callSignalTypes are WebSocket message types that should be forwarded
// point-to-point from sender to the "to" field recipient.
var callSignalTypes = map[string]bool{
	"call-invite":   true,
	"call-accept":   true,
	"call-reject":   true,
	"call-end":      true,
	"call-signal":   true,
	"call-chat":     true,
	"call-reaction": true,
}

// callMessage is the envelope for call signaling messages.
// The hub injects "from" server-side to prevent spoofing.
type callMessage struct {
	Type    string          `json:"type"`
	To      string          `json:"to"`
	From    string          `json:"from,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// handleCallSignal processes an incoming call-related message from a client.
func (h *Hub) handleCallSignal(sender *client, data []byte) {
	var msg callMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		h.log.Warn().Err(err).Str("from", sender.email).Msg("call signal: failed to parse message")
		return
	}
	if !callSignalTypes[msg.Type] {
		return
	}
	if msg.To == "" {
		h.log.Debug().Str("type", msg.Type).Str("from", sender.email).Msg("call signal: empty 'to' field, dropping")
		return
	}

	h.log.Debug().Str("type", msg.Type).Str("from", sender.email).Str("to", msg.To).Msg("call signal: routing message")

	// Inject authenticated sender identity.
	msg.From = sender.email

	// Room-scoped routing: when the recipient is a placeholder like "__host__"
	// or "__all__", broadcast to all other clients sharing the same room
	// identity (both host and guest connect as "guest:{roomId}").
	if msg.To == "__host__" || msg.To == "__all__" {
		out, err := json.Marshal(msg)
		if err != nil {
			return
		}
		h.mu.RLock()
		peerCount := len(h.byEmail[sender.email]) - 1
		h.mu.RUnlock()
		h.log.Debug().Str("type", msg.Type).Str("from", sender.email).Int("peers", peerCount).Msg("call signal: room broadcast")
		h.sendToOthers(sender, out)
		return
	}

	// When sender and recipient share the same room identity (both are
	// "guest:{roomId}"), treat it as a room broadcast to the other participant
	// instead of dropping as a self-send.
	if msg.To == sender.email {
		out, err := json.Marshal(msg)
		if err != nil {
			return
		}
		h.mu.RLock()
		peerCount := len(h.byEmail[sender.email]) - 1
		h.mu.RUnlock()
		if peerCount > 0 {
			h.log.Debug().Str("type", msg.Type).Str("from", sender.email).Int("peers", peerCount).Msg("call signal: same-identity room broadcast")
			h.sendToOthers(sender, out)
		}
		return
	}

	out, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	targetCount := len(h.byEmail[msg.To])
	h.mu.RUnlock()
	h.log.Debug().Str("type", msg.Type).Str("from", sender.email).Str("to", msg.To).Int("targets", targetCount).Msg("call signal: point-to-point")

	h.SendTo(msg.To, out)
}

// sendToOthers sends raw bytes to all other clients sharing the same email
// identity as the sender (i.e. room broadcast excluding self).
func (h *Hub) sendToOthers(sender *client, data []byte) {
	h.mu.RLock()
	clients := h.byEmail[sender.email]
	h.mu.RUnlock()

	for c := range clients {
		if c == sender {
			continue
		}
		select {
		case c.send <- data:
		default:
			h.log.Warn().Str("email", sender.email).Msg("call signal: send buffer full (room broadcast)")
		}
	}
}

// SendTo sends raw bytes to all WebSocket connections for a given email.
func (h *Hub) SendTo(email string, data []byte) {
	h.mu.RLock()
	clients := h.byEmail[email]
	h.mu.RUnlock()

	for c := range clients {
		select {
		case c.send <- data:
		default:
			h.log.Warn().Str("email", email).Msg("call signal: send buffer full")
		}
	}
}
