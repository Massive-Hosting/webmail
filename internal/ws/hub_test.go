package ws

import (
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func testLogger() zerolog.Logger {
	return zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).Level(zerolog.Disabled)
}

func TestHub_RegisterUnregister(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	c := &client{
		email:     "alice@example.com",
		accountID: "acc1",
		send:      make(chan []byte, 32),
	}

	hub.register(c)

	if hub.ActiveConnections() != 1 {
		t.Fatalf("expected 1 connection, got %d", hub.ActiveConnections())
	}

	hub.mu.RLock()
	emailClients := hub.byEmail["alice@example.com"]
	hub.mu.RUnlock()
	if len(emailClients) != 1 {
		t.Fatalf("expected 1 client for alice, got %d", len(emailClients))
	}

	hub.unregister(c)

	if hub.ActiveConnections() != 0 {
		t.Fatalf("expected 0 connections after unregister, got %d", hub.ActiveConnections())
	}

	hub.mu.RLock()
	_, exists := hub.byEmail["alice@example.com"]
	hub.mu.RUnlock()
	if exists {
		t.Fatal("expected email entry to be removed after last client unregisters")
	}
}

func TestHub_MultipleClientsPerEmail(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	c1 := &client{email: "bob@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	c2 := &client{email: "bob@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	c3 := &client{email: "carol@example.com", accountID: "acc2", send: make(chan []byte, 32)}

	hub.register(c1)
	hub.register(c2)
	hub.register(c3)

	if hub.ActiveConnections() != 3 {
		t.Fatalf("expected 3 connections, got %d", hub.ActiveConnections())
	}

	hub.mu.RLock()
	bobClients := len(hub.byEmail["bob@example.com"])
	carolClients := len(hub.byEmail["carol@example.com"])
	hub.mu.RUnlock()

	if bobClients != 2 {
		t.Fatalf("expected 2 clients for bob, got %d", bobClients)
	}
	if carolClients != 1 {
		t.Fatalf("expected 1 client for carol, got %d", carolClients)
	}

	// Unregister one of bob's clients.
	hub.unregister(c1)

	hub.mu.RLock()
	bobClients = len(hub.byEmail["bob@example.com"])
	hub.mu.RUnlock()

	if bobClients != 1 {
		t.Fatalf("expected 1 client for bob after unregister, got %d", bobClients)
	}

	if hub.ActiveConnections() != 2 {
		t.Fatalf("expected 2 connections, got %d", hub.ActiveConnections())
	}
}

func TestHub_Broadcast(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	c1 := &client{email: "alice@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	c2 := &client{email: "alice@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	c3 := &client{email: "bob@example.com", accountID: "acc2", send: make(chan []byte, 32)}

	hub.register(c1)
	hub.register(c2)
	hub.register(c3)

	msg := &Message{
		Type:    "stateChange",
		Changed: map[string]string{"Email": "state123", "Mailbox": "state456"},
	}

	hub.Broadcast("alice@example.com", msg)

	// Both of alice's clients should receive the message.
	select {
	case data := <-c1.send:
		var received Message
		if err := json.Unmarshal(data, &received); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if received.Type != "stateChange" {
			t.Fatalf("expected type stateChange, got %s", received.Type)
		}
		if received.Changed["Email"] != "state123" {
			t.Fatalf("expected Email state state123, got %s", received.Changed["Email"])
		}
	case <-time.After(time.Second):
		t.Fatal("c1 did not receive message")
	}

	select {
	case <-c2.send:
		// OK
	case <-time.After(time.Second):
		t.Fatal("c2 did not receive message")
	}

	// Bob should NOT receive the message.
	select {
	case <-c3.send:
		t.Fatal("bob should not have received a message")
	case <-time.After(50 * time.Millisecond):
		// OK — no message for bob
	}
}

func TestHub_BroadcastDropsOnFullBuffer(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	// Create client with buffer size 1.
	c := &client{email: "alice@example.com", accountID: "acc1", send: make(chan []byte, 1)}
	hub.register(c)

	msg := &Message{Type: "stateChange", Changed: map[string]string{"Email": "s1"}}

	// Fill the buffer.
	hub.Broadcast("alice@example.com", msg)

	// This should not block — it should drop.
	hub.Broadcast("alice@example.com", msg)

	// Drain.
	select {
	case <-c.send:
	default:
		t.Fatal("expected one message in buffer")
	}
}

func TestHub_ConcurrentBroadcast(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	const numClients = 10
	clients := make([]*client, numClients)
	for i := 0; i < numClients; i++ {
		clients[i] = &client{email: "user@example.com", accountID: "acc1", send: make(chan []byte, 100)}
		hub.register(clients[i])
	}

	const numMessages = 50
	var wg sync.WaitGroup
	wg.Add(numMessages)

	for i := 0; i < numMessages; i++ {
		go func() {
			defer wg.Done()
			hub.Broadcast("user@example.com", &Message{
				Type:    "stateChange",
				Changed: map[string]string{"Email": "s"},
			})
		}()
	}

	wg.Wait()

	// Each client should have received all messages.
	for i, c := range clients {
		count := len(c.send)
		if count != numMessages {
			t.Errorf("client %d received %d messages, expected %d", i, count, numMessages)
		}
	}
}

func TestHub_Shutdown(t *testing.T) {
	hub := NewHub(testLogger())

	c1 := &client{email: "alice@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	c2 := &client{email: "bob@example.com", accountID: "acc2", send: make(chan []byte, 32)}

	hub.register(c1)
	hub.register(c2)

	if hub.ActiveConnections() != 2 {
		t.Fatalf("expected 2 connections, got %d", hub.ActiveConnections())
	}

	hub.Shutdown()

	if hub.ActiveConnections() != 0 {
		t.Fatalf("expected 0 connections after shutdown, got %d", hub.ActiveConnections())
	}
}
