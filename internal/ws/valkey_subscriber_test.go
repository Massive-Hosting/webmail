package ws

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func setupMiniredis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})
	t.Cleanup(func() { rdb.Close() })
	return mr, rdb
}

func TestSubscribeReceivesPublishedMessages(t *testing.T) {
	mr, rdb := setupMiniredis(t)
	sub := NewValkeySubscriber(rdb)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var received []string
	var mu sync.Mutex
	done := make(chan struct{})

	go func() {
		_ = sub.Subscribe(ctx, "test-channel", func(message string) {
			mu.Lock()
			received = append(received, message)
			if len(received) == 2 {
				mu.Unlock()
				cancel()
				return
			}
			mu.Unlock()
		})
		close(done)
	}()

	// Give the subscriber time to connect.
	time.Sleep(50 * time.Millisecond)

	mr.Publish("test-channel", "hello")
	mr.Publish("test-channel", "world")

	<-done

	mu.Lock()
	defer mu.Unlock()

	if len(received) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(received))
	}
	if received[0] != "hello" {
		t.Errorf("expected first message 'hello', got %q", received[0])
	}
	if received[1] != "world" {
		t.Errorf("expected second message 'world', got %q", received[1])
	}
}

func TestSubscribeReturnsOnContextCancellation(t *testing.T) {
	_, rdb := setupMiniredis(t)
	sub := NewValkeySubscriber(rdb)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)

	go func() {
		done <- sub.Subscribe(ctx, "test-channel", func(message string) {})
	}()

	// Give the subscriber time to connect.
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err != context.Canceled {
			t.Errorf("expected context.Canceled, got %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Subscribe did not return after context cancellation")
	}
}

func TestSubscribeMultipleMessagesInOrder(t *testing.T) {
	mr, rdb := setupMiniredis(t)
	sub := NewValkeySubscriber(rdb)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	expected := []string{"msg-1", "msg-2", "msg-3", "msg-4", "msg-5"}
	var received []string
	var mu sync.Mutex
	done := make(chan struct{})

	go func() {
		_ = sub.Subscribe(ctx, "ordered-channel", func(message string) {
			mu.Lock()
			received = append(received, message)
			if len(received) == len(expected) {
				mu.Unlock()
				cancel()
				return
			}
			mu.Unlock()
		})
		close(done)
	}()

	time.Sleep(50 * time.Millisecond)

	for _, msg := range expected {
		mr.Publish("ordered-channel", msg)
	}

	<-done

	mu.Lock()
	defer mu.Unlock()

	if len(received) != len(expected) {
		t.Fatalf("expected %d messages, got %d", len(expected), len(received))
	}
	for i, msg := range expected {
		if received[i] != msg {
			t.Errorf("message %d: expected %q, got %q", i, msg, received[i])
		}
	}
}
