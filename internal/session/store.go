package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Store manages sessions in Valkey/Redis.
type Store struct {
	rdb           redis.Cmdable
	maxAge        time.Duration
	encryptionKey []byte // AES-256 key for encrypting secrets in session data
}

// NewStore creates a session store backed by the given Redis client.
// The encryptionKey (32 bytes) is used to encrypt sensitive session fields
// (password, stalwart token) before they are stored in Valkey.
func NewStore(rdb redis.Cmdable, maxAgeSeconds int, encryptionKey []byte) *Store {
	return &Store{
		rdb:           rdb,
		maxAge:        time.Duration(maxAgeSeconds) * time.Second,
		encryptionKey: encryptionKey,
	}
}

// MaxAge returns the session max age in seconds.
func (s *Store) MaxAge() int {
	return int(s.maxAge / time.Second)
}

// Create stores session data in Valkey with a TTL and returns a random token.
// Sensitive fields are encrypted before storage.
func (s *Store) Create(ctx context.Context, data *SessionData) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generating session token: %w", err)
	}

	// Encrypt secrets before persisting — work on a copy to avoid mutating caller's data.
	stored := *data
	if len(s.encryptionKey) > 0 {
		if err := stored.EncryptSecrets(s.encryptionKey); err != nil {
			return "", fmt.Errorf("encrypting session secrets: %w", err)
		}
	}

	value, err := json.Marshal(&stored)
	if err != nil {
		return "", fmt.Errorf("marshaling session data: %w", err)
	}

	key := sessionKey(token)
	if err := s.rdb.Set(ctx, key, value, s.maxAge).Err(); err != nil {
		return "", fmt.Errorf("storing session in valkey: %w", err)
	}

	return token, nil
}

// Get retrieves session data by token and refreshes the TTL (sliding window).
func (s *Store) Get(ctx context.Context, token string) (*SessionData, error) {
	key := sessionKey(token)

	value, err := s.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, errors.New("session not found")
	}
	if err != nil {
		return nil, fmt.Errorf("reading session from valkey: %w", err)
	}

	var data SessionData
	if err := json.Unmarshal(value, &data); err != nil {
		return nil, fmt.Errorf("unmarshaling session data: %w", err)
	}

	// Decrypt secrets after retrieval.
	if len(s.encryptionKey) > 0 {
		if err := data.DecryptSecrets(s.encryptionKey); err != nil {
			return nil, fmt.Errorf("decrypting session secrets: %w", err)
		}
	}

	// Sliding window: refresh TTL on every read.
	s.rdb.Expire(ctx, key, s.maxAge) //nolint:errcheck

	return &data, nil
}

// Delete removes a session from Valkey (logout).
func (s *Store) Delete(ctx context.Context, token string) error {
	key := sessionKey(token)
	return s.rdb.Del(ctx, key).Err()
}

func sessionKey(token string) string {
	return "session:" + token
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
