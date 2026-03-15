package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// TaskProgress represents a progress event from a Temporal workflow,
// published via Valkey pub/sub.
type TaskProgress struct {
	Type     string  `json:"type"`     // always "taskProgress"
	TaskID   string  `json:"taskId"`
	TaskType string  `json:"taskType"`
	Progress float64 `json:"progress"` // 0.0 to 1.0
	Detail   string  `json:"detail"`
	Status   string  `json:"status"` // "running" | "completed" | "failed"
}

// ValkeySubscriber defines the interface for subscribing to Valkey pub/sub.
// This decouples the progress relay from a specific Redis/Valkey client library.
type ValkeySubscriber interface {
	// Subscribe subscribes to a channel and calls handler for each message.
	// It blocks until ctx is cancelled or an error occurs.
	Subscribe(ctx context.Context, channel string, handler func(message string)) error
}

// ProgressRelay subscribes to Valkey pub/sub channels for task progress
// and relays events to the WebSocket hub.
type ProgressRelay struct {
	hub       *Hub
	subscriber ValkeySubscriber
	log       zerolog.Logger
}

// NewProgressRelay creates a new progress relay.
func NewProgressRelay(hub *Hub, subscriber ValkeySubscriber, log zerolog.Logger) *ProgressRelay {
	return &ProgressRelay{
		hub:       hub,
		subscriber: subscriber,
		log:       log.With().Str("component", "progress-relay").Logger(),
	}
}

// RelayForUser subscribes to the progress channel for a specific user
// and relays events via WebSocket. Blocks until ctx is cancelled.
func (r *ProgressRelay) RelayForUser(ctx context.Context, email string) {
	channel := fmt.Sprintf("webmail:progress:%s", email)
	backoff := initialBackoff

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if r.subscriber == nil {
			// No Valkey subscriber configured; skip.
			return
		}

		err := r.subscriber.Subscribe(ctx, channel, func(message string) {
			r.handleProgressMessage(email, message)
		})

		if err != nil {
			if ctx.Err() != nil {
				return
			}
			r.log.Warn().Err(err).Str("channel", channel).Dur("backoff", backoff).
				Msg("valkey subscription failed, reconnecting")
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

func (r *ProgressRelay) handleProgressMessage(email, message string) {
	var progress TaskProgress
	if err := json.Unmarshal([]byte(message), &progress); err != nil {
		r.log.Warn().Err(err).Str("message", message).Msg("failed to parse progress message")
		return
	}

	// Ensure type is set correctly.
	progress.Type = "taskProgress"

	data, err := json.Marshal(progress)
	if err != nil {
		r.log.Error().Err(err).Msg("failed to marshal progress message")
		return
	}

	r.hub.mu.RLock()
	clients := r.hub.byEmail[email]
	r.hub.mu.RUnlock()

	for c := range clients {
		select {
		case c.send <- data:
		default:
			r.log.Warn().Str("email", email).Msg("websocket send buffer full, dropping progress message")
		}
	}
}

// ExtractEmailFromChannel extracts the email from a progress channel name.
// Channel format: "webmail:progress:{email}"
func ExtractEmailFromChannel(channel string) string {
	const prefix = "webmail:progress:"
	if strings.HasPrefix(channel, prefix) {
		return channel[len(prefix):]
	}
	return ""
}
