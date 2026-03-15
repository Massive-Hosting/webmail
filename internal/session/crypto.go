package session

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// SessionData holds the encrypted session payload stored in the cookie.
type SessionData struct {
	Email         string    `json:"e"`
	Password      string    `json:"p"`
	AccountID     string    `json:"a"`
	StalwartURL   string    `json:"s"`
	StalwartToken string    `json:"t"`
	UAHash        string    `json:"u"`
	IssuedAt      time.Time `json:"i"`
	ExpiresAt     time.Time `json:"x"`
}

// Manager handles session encryption, decryption, and cookie management.
type Manager struct {
	gcm       cipher.AEAD
	maxAge    int
	cookieKey string
}

// NewManager creates a session manager with the given AES-256 key and max age in seconds.
func NewManager(key []byte, maxAge int) (*Manager, error) {
	if len(key) != 32 {
		return nil, errors.New("session key must be 32 bytes for AES-256")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("creating AES cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating GCM: %w", err)
	}
	return &Manager{
		gcm:       gcm,
		maxAge:    maxAge,
		cookieKey: "session",
	}, nil
}

// Encrypt serializes and encrypts session data, returning a base64url-encoded string.
func (m *Manager) Encrypt(data *SessionData) (string, error) {
	plaintext, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshaling session: %w", err)
	}

	nonce := make([]byte, m.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generating nonce: %w", err)
	}

	ciphertext := m.gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decodes and decrypts a base64url-encoded session string.
func (m *Manager) Decrypt(encoded string) (*SessionData, error) {
	ciphertext, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, errors.New("invalid session encoding")
	}

	nonceSize := m.gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("session data too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := m.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, errors.New("session decryption failed (tampered or invalid key)")
	}

	var data SessionData
	if err := json.Unmarshal(plaintext, &data); err != nil {
		return nil, errors.New("invalid session data")
	}

	if time.Now().After(data.ExpiresAt) {
		return nil, errors.New("session expired")
	}

	return &data, nil
}

// SetCookie writes the encrypted session as an HTTP cookie.
func (m *Manager) SetCookie(w http.ResponseWriter, data *SessionData) error {
	encoded, err := m.Encrypt(data)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     m.cookieKey,
		Value:    encoded,
		Path:     "/api",
		MaxAge:   m.maxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
	return nil
}

// ClearCookie removes the session cookie.
func (m *Manager) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     m.cookieKey,
		Value:    "",
		Path:     "/api",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// GetSession extracts and decrypts the session from the request cookie.
func (m *Manager) GetSession(r *http.Request) (*SessionData, error) {
	cookie, err := r.Cookie(m.cookieKey)
	if err != nil {
		return nil, errors.New("no session cookie")
	}
	return m.Decrypt(cookie.Value)
}

// HashUserAgent returns a SHA-256 hash of the User-Agent string for session binding.
func HashUserAgent(ua string) string {
	h := sha256.Sum256([]byte(ua))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
