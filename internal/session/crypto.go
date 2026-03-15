package session

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
)

// SessionData holds the session payload stored in Valkey.
type SessionData struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	AccountID     string `json:"accountId"`
	StalwartURL   string `json:"stalwartUrl"`
	StalwartToken string `json:"stalwartToken"`
	UAHash        string `json:"uaHash"`
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
