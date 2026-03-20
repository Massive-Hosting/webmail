package session

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"

	"webmail/internal/credcrypt"
)

// SessionData holds the session payload stored in Valkey.
// Sensitive fields (Password, StalwartToken) are encrypted with AES-256-GCM
// before being stored, so a Valkey compromise does not expose plaintext secrets.
type SessionData struct {
	Email         string `json:"email"`
	Password      string `json:"password"`      // AES-256-GCM encrypted, base64-encoded
	AccountID     string `json:"accountId"`
	StalwartURL   string `json:"stalwartUrl"`
	StalwartToken string `json:"stalwartToken"` // AES-256-GCM encrypted, base64-encoded
	UAHash        string `json:"uaHash"`
}

// EncryptSecrets encrypts Password and StalwartToken in-place before storage.
func (s *SessionData) EncryptSecrets(key []byte) error {
	enc, err := credcrypt.Encrypt(key, s.Password)
	if err != nil {
		return err
	}
	s.Password = enc

	enc, err = credcrypt.Encrypt(key, s.StalwartToken)
	if err != nil {
		return err
	}
	s.StalwartToken = enc
	return nil
}

// DecryptSecrets decrypts Password and StalwartToken in-place after retrieval.
func (s *SessionData) DecryptSecrets(key []byte) error {
	dec, err := credcrypt.Decrypt(key, s.Password)
	if err != nil {
		return err
	}
	s.Password = dec

	dec, err = credcrypt.Decrypt(key, s.StalwartToken)
	if err != nil {
		return err
	}
	s.StalwartToken = dec
	return nil
}

// CookieName is the name of the session cookie.
const CookieName = "webmail_session"

// SetCookie writes the session token as an HTTP cookie.
func SetCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/api",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// ClearCookie removes the session cookie.
func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/api",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// TokenFromRequest extracts the session token from the request cookie.
func TokenFromRequest(r *http.Request) (string, error) {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return "", err
	}
	return cookie.Value, nil
}

// HashUserAgent returns a SHA-256 hash of the User-Agent string for session binding.
func HashUserAgent(ua string) string {
	h := sha256.Sum256([]byte(ua))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
