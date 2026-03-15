package ws

import (
	"encoding/json"
	"testing"
)

func TestParseSSELine_Empty(t *testing.T) {
	field, value := ParseSSELine("")
	if field != "" || value != "" {
		t.Fatalf("expected empty, got field=%q value=%q", field, value)
	}
}

func TestParseSSELine_Comment(t *testing.T) {
	field, value := ParseSSELine(": this is a comment")
	if field != "comment" {
		t.Fatalf("expected field 'comment', got %q", field)
	}
	if value != "this is a comment" {
		t.Fatalf("expected value 'this is a comment', got %q", value)
	}
}

func TestParseSSELine_Event(t *testing.T) {
	field, value := ParseSSELine("event: state")
	if field != "event" {
		t.Fatalf("expected field 'event', got %q", field)
	}
	if value != "state" {
		t.Fatalf("expected value 'state', got %q", value)
	}
}

func TestParseSSELine_Data(t *testing.T) {
	field, value := ParseSSELine(`data: {"changed":{"Email":"s1"}}`)
	if field != "data" {
		t.Fatalf("expected field 'data', got %q", field)
	}
	if value != `{"changed":{"Email":"s1"}}` {
		t.Fatalf("unexpected value: %q", value)
	}
}

func TestParseSSELine_DataNoSpace(t *testing.T) {
	field, value := ParseSSELine(`data:{"changed":{}}`)
	if field != "data" {
		t.Fatalf("expected field 'data', got %q", field)
	}
	if value != `{"changed":{}}` {
		t.Fatalf("unexpected value: %q", value)
	}
}

func TestParseSSELine_FieldOnly(t *testing.T) {
	field, value := ParseSSELine("retry")
	if field != "retry" {
		t.Fatalf("expected field 'retry', got %q", field)
	}
	if value != "" {
		t.Fatalf("expected empty value, got %q", value)
	}
}

func TestParseSSELine_FieldWithColonValue(t *testing.T) {
	field, value := ParseSSELine("id: 123:456")
	if field != "id" {
		t.Fatalf("expected field 'id', got %q", field)
	}
	if value != "123:456" {
		t.Fatalf("expected value '123:456', got %q", value)
	}
}

func TestParseSSELine_CommentEmpty(t *testing.T) {
	field, _ := ParseSSELine(":")
	if field != "comment" {
		t.Fatalf("expected field 'comment', got %q", field)
	}
}

func TestHandleEvent_StateChange(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	c := &client{email: "alice@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	hub.register(c)

	sub := NewEventSourceSubscriber(hub, "alice@example.com", "http://localhost", "alice", "pass", testLogger())

	// Simulate a Stalwart state change event with account-keyed format.
	sub.handleEvent("state", `{"changed":{"acc1":{"Email":"s2","Mailbox":"s3"}}}`)

	select {
	case data := <-c.send:
		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if msg.Type != "stateChange" {
			t.Fatalf("expected stateChange, got %s", msg.Type)
		}
		if msg.Changed["Email"] != "s2" {
			t.Fatalf("expected Email s2, got %s", msg.Changed["Email"])
		}
		if msg.Changed["Mailbox"] != "s3" {
			t.Fatalf("expected Mailbox s3, got %s", msg.Changed["Mailbox"])
		}
	default:
		t.Fatal("expected message from hub")
	}
}

func TestHandleEvent_FlatStateChange(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	c := &client{email: "bob@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	hub.register(c)

	sub := NewEventSourceSubscriber(hub, "bob@example.com", "http://localhost", "bob", "pass", testLogger())

	// Flat format (changed is directly type→state).
	sub.handleEvent("state", `{"changed":{"Email":"flat1"}}`)

	select {
	case data := <-c.send:
		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if msg.Changed["Email"] != "flat1" {
			t.Fatalf("expected Email flat1, got %s", msg.Changed["Email"])
		}
	default:
		// Flat format may be parsed as account-keyed first. Check if it fell through.
		// The implementation tries account-keyed first; if that fails it tries flat.
		// Since {"Email":"flat1"} doesn't parse as map[string]map[string]string,
		// it should fall through to the flat path.
		t.Fatal("expected message from hub")
	}
}

func TestHandleEvent_Ping(t *testing.T) {
	hub := NewHub(testLogger())
	defer hub.Shutdown()

	c := &client{email: "alice@example.com", accountID: "acc1", send: make(chan []byte, 32)}
	hub.register(c)

	sub := NewEventSourceSubscriber(hub, "alice@example.com", "http://localhost", "alice", "pass", testLogger())

	// Ping events should be ignored.
	sub.handleEvent("ping", "")

	select {
	case <-c.send:
		t.Fatal("ping should not produce a message")
	default:
		// OK
	}
}
