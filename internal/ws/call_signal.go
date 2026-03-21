package ws

import "encoding/json"

// callSignalTypes are WebSocket message types that should be forwarded
// point-to-point from sender to the "to" field recipient.
var callSignalTypes = map[string]bool{
	"call-invite": true,
	"call-accept": true,
	"call-reject": true,
	"call-end":    true,
	"call-signal": true,
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
		return
	}
	if !callSignalTypes[msg.Type] {
		return
	}
	if msg.To == "" || msg.To == sender.email {
		return
	}

	// Inject authenticated sender identity.
	msg.From = sender.email
	out, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.SendTo(msg.To, out)
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
