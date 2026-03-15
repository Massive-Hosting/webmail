package session

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestStore(t *testing.T) (*Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })
	return NewStore(rdb, 3600), mr
}

func TestCreateAndGet(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()

	original := &SessionData{
		Email:         "user@example.com",
		Password:      "secret-password-123",
		AccountID:     "abc123",
		StalwartURL:   "https://stalwart.example.com",
		StalwartToken: "admin-token-xyz",
		UAHash:        HashUserAgent("Mozilla/5.0"),
	}

	token, err := store.Create(ctx, original)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if len(token) != 64 {
		t.Fatalf("expected 64-char hex token, got %d chars", len(token))
	}

	retrieved, err := store.Get(ctx, token)
	if err != nil {
		t.Fatalf("get failed: %v", err)
	}

	if retrieved.Email != original.Email {
		t.Errorf("email mismatch: got %q, want %q", retrieved.Email, original.Email)
	}
	if retrieved.Password != original.Password {
		t.Errorf("password mismatch: got %q, want %q", retrieved.Password, original.Password)
	}
	if retrieved.AccountID != original.AccountID {
		t.Errorf("accountID mismatch: got %q, want %q", retrieved.AccountID, original.AccountID)
	}
	if retrieved.StalwartURL != original.StalwartURL {
		t.Errorf("stalwartURL mismatch: got %q, want %q", retrieved.StalwartURL, original.StalwartURL)
	}
	if retrieved.StalwartToken != original.StalwartToken {
		t.Errorf("stalwartToken mismatch: got %q, want %q", retrieved.StalwartToken, original.StalwartToken)
	}
	if retrieved.UAHash != original.UAHash {
		t.Errorf("uaHash mismatch: got %q, want %q", retrieved.UAHash, original.UAHash)
	}
}

func TestGetNonexistentSession(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()

	_, err := store.Get(ctx, "nonexistent-token-0000000000000000000000000000000000000000000000000000")
	if err == nil {
		t.Fatal("expected error for nonexistent session, got nil")
	}
}

func TestDeleteSession(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()

	data := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
	}

	token, err := store.Create(ctx, data)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	// Verify session exists.
	if _, err := store.Get(ctx, token); err != nil {
		t.Fatalf("get before delete failed: %v", err)
	}

	// Delete.
	if err := store.Delete(ctx, token); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	// Verify session is gone.
	_, err = store.Get(ctx, token)
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

func TestSessionExpiry(t *testing.T) {
	store, mr := newTestStore(t)
	ctx := context.Background()

	data := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
	}

	token, err := store.Create(ctx, data)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	// Fast-forward past TTL.
	mr.FastForward(store.maxAge + 1)

	_, err = store.Get(ctx, token)
	if err == nil {
		t.Fatal("expected error for expired session, got nil")
	}
}

func TestUniqueTokens(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()

	data := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
	}

	token1, _ := store.Create(ctx, data)
	token2, _ := store.Create(ctx, data)

	if token1 == token2 {
		t.Error("two sessions produced identical tokens")
	}
}

func TestHashUserAgent(t *testing.T) {
	ua1 := HashUserAgent("Mozilla/5.0")
	ua2 := HashUserAgent("Mozilla/5.0")
	ua3 := HashUserAgent("Chrome/100")

	if ua1 != ua2 {
		t.Error("same user agent produced different hashes")
	}
	if ua1 == ua3 {
		t.Error("different user agents produced same hash")
	}
}

func TestMaxAge(t *testing.T) {
	store, _ := newTestStore(t)
	if store.MaxAge() != 3600 {
		t.Errorf("MaxAge: got %d, want 3600", store.MaxAge())
	}
}
