package ws

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

const (
	initialBackoff = 1 * time.Second
	maxBackoff     = 30 * time.Second
	backoffFactor  = 2
)

// StateChange represents a JMAP state change event from Stalwart.
type StateChange struct {
	Changed map[string]string `json:"changed"`
}

// EventSourceSubscriber connects to Stalwart's JMAP EventSource endpoint
// and forwards state change events to the WebSocket hub.
type EventSourceSubscriber struct {
	hub         *Hub
	email       string
	stalwartURL string
	username    string
	password    string
	log         zerolog.Logger
	client      *http.Client
}

// NewEventSourceSubscriber creates a new SSE subscriber for a user.
func NewEventSourceSubscriber(
	hub *Hub,
	email string,
	stalwartURL string,
	username string,
	password string,
	log zerolog.Logger,
) *EventSourceSubscriber {
	return &EventSourceSubscriber{
		hub:         hub,
		email:       email,
		stalwartURL: stalwartURL,
		username:    username,
		password:    password,
		log:         log.With().Str("component", "eventsource").Str("email", email).Logger(),
		client: &http.Client{
			// No timeout — SSE connections are long-lived.
			Timeout: 0,
		},
	}
}

// Subscribe connects to the EventSource endpoint and relays events until
// ctx is cancelled. It reconnects with exponential backoff on failure.
func (s *EventSourceSubscriber) Subscribe(ctx context.Context) {
	backoff := initialBackoff

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := s.connect(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			s.log.Warn().Err(err).Dur("backoff", backoff).Msg("eventsource disconnected, reconnecting")
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		backoff = backoff * backoffFactor
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (s *EventSourceSubscriber) connect(ctx context.Context) error {
	url := strings.TrimRight(s.stalwartURL, "/") + "/jmap/eventsource/?types=*&closeafter=no&ping=30"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	req.SetBasicAuth(s.username, s.password)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("connecting to eventsource: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("eventsource returned status %d", resp.StatusCode)
	}

	s.log.Debug().Msg("eventsource connected")

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024)

	var eventType string
	var dataLines []string

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := scanner.Text()

		if line == "" {
			// Empty line = end of event.
			if len(dataLines) > 0 {
				data := strings.Join(dataLines, "\n")
				s.handleEvent(eventType, data)
			}
			eventType = ""
			dataLines = nil
			continue
		}

		if strings.HasPrefix(line, ":") {
			// Comment / ping, ignore.
			continue
		}

		if strings.HasPrefix(line, "event:") {
			eventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}

		if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
			continue
		}

		// Other fields (id:, retry:) — ignore for now.
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("reading eventsource: %w", err)
	}

	return fmt.Errorf("eventsource stream ended")
}

func (s *EventSourceSubscriber) handleEvent(eventType, data string) {
	if eventType == "ping" || data == "" {
		return
	}

	// Parse the state change from JMAP EventSource.
	// Stalwart sends: {"changed": {"accountId": {"Email": "newState", "Mailbox": "newState"}}}
	// We need to extract the type→state map for our user's account.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &raw); err != nil {
		s.log.Warn().Err(err).Str("data", data).Msg("failed to parse eventsource event")
		return
	}

	changedRaw, ok := raw["changed"]
	if !ok {
		return
	}

	// changed is a map of accountId → {type: state}
	var changedByAccount map[string]map[string]string
	if err := json.Unmarshal(changedRaw, &changedByAccount); err != nil {
		// Try as a flat map (type → state) in case Stalwart sends it directly.
		var flat map[string]string
		if err2 := json.Unmarshal(changedRaw, &flat); err2 != nil {
			s.log.Warn().Err(err).Str("data", data).Msg("failed to parse changed field")
			return
		}
		s.broadcastStateChange(flat)
		return
	}

	// Broadcast changes for any account (user may have only one).
	for _, types := range changedByAccount {
		s.broadcastStateChange(types)
	}
}

func (s *EventSourceSubscriber) broadcastStateChange(changed map[string]string) {
	if len(changed) == 0 {
		return
	}

	s.log.Debug().Interface("changed", changed).Msg("broadcasting state change")

	s.hub.Broadcast(s.email, &Message{
		Type:    "stateChange",
		Changed: changed,
	})
}

// ParseSSELine parses a single SSE line into field and value.
// Exported for testing.
func ParseSSELine(line string) (field, value string) {
	if line == "" {
		return "", ""
	}

	if line[0] == ':' {
		return "comment", strings.TrimSpace(line[1:])
	}

	idx := strings.IndexByte(line, ':')
	if idx < 0 {
		return line, ""
	}

	field = line[:idx]
	value = line[idx+1:]
	if len(value) > 0 && value[0] == ' ' {
		value = value[1:]
	}

	return field, value
}
