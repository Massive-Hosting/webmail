package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
)

const (
	pingInterval = 30 * time.Second
	pongTimeout  = 10 * time.Second
	writeTimeout = 10 * time.Second
)

// Message represents a WebSocket message sent to clients.
type Message struct {
	Type    string            `json:"type"`
	Changed map[string]string `json:"changed,omitempty"`
	Message string            `json:"message,omitempty"`
}

// client represents a single WebSocket connection.
type client struct {
	conn      *websocket.Conn
	email     string
	accountID string
	send      chan []byte
}

// Hub manages all active WebSocket connections.
type Hub struct {
	mu       sync.RWMutex
	clients  map[*client]bool
	byEmail  map[string]map[*client]bool
	log      zerolog.Logger
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewHub creates a new WebSocket hub.
func NewHub(log zerolog.Logger) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		clients: make(map[*client]bool),
		byEmail: make(map[string]map[*client]bool),
		log:     log,
		ctx:     ctx,
		cancel:  cancel,
	}
}

// Shutdown gracefully shuts down the hub and all connections.
func (h *Hub) Shutdown() {
	h.cancel()

	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.clients {
		if c.conn != nil {
			c.conn.Close(websocket.StatusGoingAway, "server shutting down")
		}
		close(c.send)
	}
	h.clients = make(map[*client]bool)
	h.byEmail = make(map[string]map[*client]bool)
}

// HandleConnection upgrades an HTTP connection to WebSocket and manages it.
func (h *Hub) HandleConnection(w http.ResponseWriter, r *http.Request, email, accountID string) error {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Origin check is handled by CORS middleware.
	})
	if err != nil {
		return err
	}

	c := &client{
		conn:      conn,
		email:     email,
		accountID: accountID,
		send:      make(chan []byte, 32),
	}

	h.register(c)
	defer h.unregister(c)

	// Start writer goroutine.
	go h.writePump(c)

	// Reader loop (handles pong and client messages).
	h.readPump(c)

	return nil
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[c] = true
	if h.byEmail[c.email] == nil {
		h.byEmail[c.email] = make(map[*client]bool)
	}
	h.byEmail[c.email][c] = true

	h.log.Debug().Str("email", c.email).Msg("websocket client connected")
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		if emailClients, ok := h.byEmail[c.email]; ok {
			delete(emailClients, c)
			if len(emailClients) == 0 {
				delete(h.byEmail, c.email)
			}
		}
		close(c.send)
		if c.conn != nil {
			c.conn.Close(websocket.StatusNormalClosure, "")
		}
	}

	h.log.Debug().Str("email", c.email).Msg("websocket client disconnected")
}

// Broadcast sends a message to all connections for a given email.
func (h *Hub) Broadcast(email string, msg *Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to marshal websocket message")
		return
	}

	h.mu.RLock()
	clients := h.byEmail[email]
	h.mu.RUnlock()

	for c := range clients {
		select {
		case c.send <- data:
		default:
			// Client send buffer full; drop message.
			h.log.Warn().Str("email", email).Msg("websocket send buffer full, dropping message")
		}
	}
}

func (h *Hub) writePump(c *client) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			ctx, cancel := context.WithTimeout(h.ctx, writeTimeout)
			err := c.conn.Write(ctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}

		case <-ticker.C:
			// Send ping as a JSON message.
			pingMsg, _ := json.Marshal(Message{Type: "ping"})
			ctx, cancel := context.WithTimeout(h.ctx, writeTimeout)
			err := c.conn.Write(ctx, websocket.MessageText, pingMsg)
			cancel()
			if err != nil {
				return
			}

		case <-h.ctx.Done():
			return
		}
	}
}

func (h *Hub) readPump(c *client) {
	for {
		ctx, cancel := context.WithTimeout(h.ctx, pingInterval+pongTimeout)
		_, data, err := c.conn.Read(ctx)
		cancel()
		if err != nil {
			return
		}

		// Parse client message (expect pong).
		var msg Message
		if json.Unmarshal(data, &msg) == nil {
			if msg.Type == "pong" {
				// Pong received, connection is alive.
				continue
			}
		}
	}
}

// ActiveConnections returns the number of active WebSocket connections.
func (h *Hub) ActiveConnections() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
