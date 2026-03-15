package session

import (
	"crypto/rand"
	"testing"
	"time"
)

func testKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	return key
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	mgr, err := NewManager(testKey(t), 3600)
	if err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	original := &SessionData{
		Email:         "user@example.com",
		Password:      "secret-password-123",
		AccountID:     "abc123",
		StalwartURL:   "https://stalwart.example.com",
		StalwartToken: "admin-token-xyz",
		UAHash:        HashUserAgent("Mozilla/5.0"),
		IssuedAt:      now.Truncate(time.Millisecond),
		ExpiresAt:     now.Add(time.Hour).Truncate(time.Millisecond),
	}

	encrypted, err := mgr.Encrypt(original)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	if encrypted == "" {
		t.Fatal("encrypted string is empty")
	}

	decrypted, err := mgr.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}

	if decrypted.Email != original.Email {
		t.Errorf("email mismatch: got %q, want %q", decrypted.Email, original.Email)
	}
	if decrypted.Password != original.Password {
		t.Errorf("password mismatch: got %q, want %q", decrypted.Password, original.Password)
	}
	if decrypted.AccountID != original.AccountID {
		t.Errorf("accountID mismatch: got %q, want %q", decrypted.AccountID, original.AccountID)
	}
	if decrypted.StalwartURL != original.StalwartURL {
		t.Errorf("stalwartURL mismatch: got %q, want %q", decrypted.StalwartURL, original.StalwartURL)
	}
	if decrypted.StalwartToken != original.StalwartToken {
		t.Errorf("stalwartToken mismatch: got %q, want %q", decrypted.StalwartToken, original.StalwartToken)
	}
	if decrypted.UAHash != original.UAHash {
		t.Errorf("uaHash mismatch: got %q, want %q", decrypted.UAHash, original.UAHash)
	}
}

func TestDecryptExpiredSession(t *testing.T) {
	mgr, err := NewManager(testKey(t), 3600)
	if err != nil {
		t.Fatal(err)
	}

	expired := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
		IssuedAt:  time.Now().Add(-2 * time.Hour),
		ExpiresAt: time.Now().Add(-1 * time.Hour), // expired 1 hour ago
	}

	encrypted, err := mgr.Encrypt(expired)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	_, err = mgr.Decrypt(encrypted)
	if err == nil {
		t.Fatal("expected error for expired session, got nil")
	}
	if err.Error() != "session expired" {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestDecryptTamperedData(t *testing.T) {
	mgr, err := NewManager(testKey(t), 3600)
	if err != nil {
		t.Fatal(err)
	}

	valid := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
		IssuedAt:  time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}

	encrypted, err := mgr.Encrypt(valid)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	// Tamper with the encrypted data.
	tampered := []byte(encrypted)
	if len(tampered) > 10 {
		tampered[10] ^= 0xFF
	}

	_, err = mgr.Decrypt(string(tampered))
	if err == nil {
		t.Fatal("expected error for tampered session, got nil")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := testKey(t)
	key2 := testKey(t)

	mgr1, err := NewManager(key1, 3600)
	if err != nil {
		t.Fatal(err)
	}
	mgr2, err := NewManager(key2, 3600)
	if err != nil {
		t.Fatal(err)
	}

	valid := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
		IssuedAt:  time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}

	encrypted, err := mgr1.Encrypt(valid)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	_, err = mgr2.Decrypt(encrypted)
	if err == nil {
		t.Fatal("expected error decrypting with wrong key, got nil")
	}
}

func TestNewManagerInvalidKeySize(t *testing.T) {
	_, err := NewManager([]byte("too-short"), 3600)
	if err == nil {
		t.Fatal("expected error for invalid key size, got nil")
	}
}

func TestUniqueNonces(t *testing.T) {
	mgr, err := NewManager(testKey(t), 3600)
	if err != nil {
		t.Fatal(err)
	}

	data := &SessionData{
		Email:     "user@example.com",
		Password:  "secret",
		AccountID: "abc123",
		IssuedAt:  time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}

	// Encrypt the same data multiple times — ciphertexts should differ due to random nonces.
	enc1, _ := mgr.Encrypt(data)
	enc2, _ := mgr.Encrypt(data)

	if enc1 == enc2 {
		t.Error("two encryptions of the same data produced identical ciphertexts (nonce reuse)")
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
