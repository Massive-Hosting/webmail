package ws

import (
	"context"

	"github.com/redis/go-redis/v9"
)

// RealValkeySubscriber implements ValkeySubscriber using a real Redis/Valkey client.
type RealValkeySubscriber struct {
	rdb *redis.Client
}

// NewValkeySubscriber creates a subscriber backed by a real Valkey client.
func NewValkeySubscriber(rdb *redis.Client) *RealValkeySubscriber {
	return &RealValkeySubscriber{rdb: rdb}
}

// Subscribe subscribes to a Valkey pub/sub channel and calls handler for each message.
// Blocks until ctx is cancelled or an error occurs.
func (s *RealValkeySubscriber) Subscribe(ctx context.Context, channel string, handler func(message string)) error {
	pubsub := s.rdb.Subscribe(ctx, channel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			handler(msg.Payload)
		}
	}
}
