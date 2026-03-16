package activity

import (
	"context"
	"strings"
	"testing"
)

func TestParseMboxMultipleMessages(t *testing.T) {
	a := &Activities{}
	mbox := `From user@example.com Mon Jan  5 12:00:00 2026
From: user@example.com
To: other@example.com
Subject: First message

Hello from message one.

From other@example.com Tue Jan  6 13:00:00 2026
From: other@example.com
To: user@example.com
Subject: Second message

Hello from message two.
`

	msgs, err := a.ParseMbox(context.Background(), []byte(mbox))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}

	// First message should contain subject and body.
	if !strings.Contains(string(msgs[0]), "Subject: First message") {
		t.Error("first message missing subject")
	}
	if !strings.Contains(string(msgs[0]), "Hello from message one.") {
		t.Error("first message missing body")
	}

	// Second message should contain its subject and body.
	if !strings.Contains(string(msgs[1]), "Subject: Second message") {
		t.Error("second message missing subject")
	}
	if !strings.Contains(string(msgs[1]), "Hello from message two.") {
		t.Error("second message missing body")
	}
}

func TestParseMboxSingleMessage(t *testing.T) {
	a := &Activities{}
	mbox := `From user@example.com Mon Jan  5 12:00:00 2026
From: user@example.com
Subject: Only message

Body content here.
`

	msgs, err := a.ParseMbox(context.Background(), []byte(mbox))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	if !strings.Contains(string(msgs[0]), "Subject: Only message") {
		t.Error("message missing subject")
	}
}

func TestParseMboxEmpty(t *testing.T) {
	a := &Activities{}
	msgs, err := a.ParseMbox(context.Background(), []byte(""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages, got %d", len(msgs))
	}
}

func TestParseMboxFromLineInBody(t *testing.T) {
	// Note: standard mbox format has "From " lines only at the start of messages.
	// The parser in blob.go splits on any "From " prefix, which is the common
	// mbox-o format behavior. Lines starting with "From " inside a body
	// would normally be escaped as ">From " by a proper mbox writer.
	// This test documents the current behavior.
	a := &Activities{}
	mbox := `From user@example.com Mon Jan  5 12:00:00 2026
From: user@example.com
Subject: Test message

This is the body.
>From someone else, this line is escaped.
Regular line.
`

	msgs, err := a.ParseMbox(context.Background(), []byte(mbox))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	if !strings.Contains(string(msgs[0]), ">From someone else") {
		t.Error("escaped From line should be preserved in body")
	}
}

func TestParseMboxMessagesAreRFC5322(t *testing.T) {
	a := &Activities{}
	mbox := `From user@example.com Mon Jan  5 12:00:00 2026
From: user@example.com
To: dest@example.com
Subject: RFC 5322 test
Date: Mon, 5 Jan 2026 12:00:00 +0000
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"

This is the message body.
`

	msgs, err := a.ParseMbox(context.Background(), []byte(mbox))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}

	msg := string(msgs[0])
	// The "From " envelope line should be stripped; RFC 5322 headers remain.
	if strings.HasPrefix(msg, "From ") {
		t.Error("message should not start with mbox 'From ' envelope line")
	}
	if !strings.HasPrefix(msg, "From:") {
		t.Error("message should start with RFC 5322 'From:' header")
	}
	// Body should be present after headers.
	if !strings.Contains(msg, "This is the message body.") {
		t.Error("message body missing")
	}
}
