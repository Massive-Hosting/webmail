package middleware

import (
	"context"
	"net/http"

	"webmail/internal/session"
)

type contextKey string

const sessionContextKey contextKey = "session"

// SessionContextKeyExported is exported for test use only.
var SessionContextKeyExported = sessionContextKey

// Auth validates the session cookie against Valkey and injects session data into the request context.
func Auth(store *session.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, err := session.TokenFromRequest(r)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			sess, err := store.Get(r.Context(), token)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Validate user-agent binding.
			uaHash := session.HashUserAgent(r.UserAgent())
			if sess.UAHash != "" && sess.UAHash != uaHash {
				http.Error(w, `{"error":"session_invalid"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), sessionContextKey, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionFromContext retrieves the session data from the request context.
func SessionFromContext(ctx context.Context) *session.SessionData {
	sess, _ := ctx.Value(sessionContextKey).(*session.SessionData)
	return sess
}
