package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"time"

	"webmail/internal/db"
	"webmail/internal/hosting"
	"webmail/internal/middleware"
	"webmail/internal/session"

	"github.com/rs/zerolog"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	sessions    *session.Manager
	queries     *db.Queries
	coreClient  *hosting.CoreAPIClient
	loginLimiter *middleware.LoginRateLimiter
	log         zerolog.Logger
	maxAge      int
}

// NewAuthHandler creates a new authentication handler.
func NewAuthHandler(
	sessions *session.Manager,
	queries *db.Queries,
	coreClient *hosting.CoreAPIClient,
	loginLimiter *middleware.LoginRateLimiter,
	log zerolog.Logger,
	maxAge int,
) *AuthHandler {
	return &AuthHandler{
		sessions:    sessions,
		queries:     queries,
		coreClient:  coreClient,
		loginLimiter: loginLimiter,
		log:         log,
		maxAge:      maxAge,
	}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Email     string `json:"email"`
	AccountID string `json:"accountId"`
}

type sessionResponse struct {
	Email     string `json:"email"`
	AccountID string `json:"accountId"`
}

// Login handles POST /api/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	var req loginRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	// Validate email format.
	if _, err := mail.ParseAddress(req.Email); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_email"})
		return
	}
	if req.Password == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	// Check per-email rate limit.
	if ok, retryAfter := h.loginLimiter.CheckEmail(req.Email); !ok {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
		writeJSON(w, http.StatusTooManyRequests, errorResponse{"rate_limit_exceeded"})
		return
	}

	ctx := r.Context()

	// Resolve Stalwart context: check DB cache first, then core API.
	sc, err := h.queries.GetStalwartContext(ctx, req.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to query stalwart context cache")
	}
	if sc == nil {
		// Cache miss: fetch from core API.
		sc, err = h.coreClient.GetStalwartContext(ctx, req.Email)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to resolve stalwart context from core API")
			writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
			return
		}
		// Cache the result.
		if cacheErr := h.queries.UpsertStalwartContext(ctx, req.Email, sc); cacheErr != nil {
			h.log.Error().Err(cacheErr).Msg("failed to cache stalwart context")
		}
	}

	// Validate credentials against Stalwart JMAP session endpoint.
	accountID, err := validateStalwartCredentials(ctx, sc.StalwartURL, req.Email, req.Password)
	if err != nil {
		h.log.Debug().Str("email", req.Email).Msg("stalwart authentication failed")

		// If we used cached context and it failed, retry with fresh context from core API.
		freshSC, freshErr := h.coreClient.GetStalwartContext(ctx, req.Email)
		if freshErr != nil {
			writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
			return
		}
		if freshSC.StalwartURL != sc.StalwartURL {
			// Context was stale, retry with fresh URL.
			if cacheErr := h.queries.UpsertStalwartContext(ctx, req.Email, freshSC); cacheErr != nil {
				h.log.Error().Err(cacheErr).Msg("failed to update stalwart context cache")
			}
			sc = freshSC
			accountID, err = validateStalwartCredentials(ctx, sc.StalwartURL, req.Email, req.Password)
			if err != nil {
				writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
				return
			}
		} else {
			writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
			return
		}
	}

	// Create session.
	now := time.Now()
	sess := &session.SessionData{
		Email:         req.Email,
		Password:      req.Password,
		AccountID:     accountID,
		StalwartURL:   sc.StalwartURL,
		StalwartToken: sc.StalwartToken,
		UAHash:        session.HashUserAgent(r.UserAgent()),
		IssuedAt:      now,
		ExpiresAt:     now.Add(time.Duration(h.maxAge) * time.Second),
	}

	if err := h.sessions.SetCookie(w, sess); err != nil {
		h.log.Error().Err(err).Msg("failed to set session cookie")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	h.log.Info().Str("email", req.Email).Msg("user logged in")
	writeJSON(w, http.StatusOK, loginResponse{
		Email:     req.Email,
		AccountID: accountID,
	})
}

// Logout handles POST /api/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	h.sessions.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// Session handles GET /api/auth/session.
func (h *AuthHandler) Session(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	// Sliding window: refresh session expiry.
	now := time.Now()
	sess.IssuedAt = now
	sess.ExpiresAt = now.Add(time.Duration(h.maxAge) * time.Second)
	if err := h.sessions.SetCookie(w, sess); err != nil {
		h.log.Error().Err(err).Msg("failed to refresh session cookie")
	}

	writeJSON(w, http.StatusOK, sessionResponse{
		Email:     sess.Email,
		AccountID: sess.AccountID,
	})
}

// validateStalwartCredentials checks credentials against Stalwart's JMAP session endpoint.
// Returns the JMAP accountId on success.
func validateStalwartCredentials(ctx context.Context, stalwartURL, email, password string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, stalwartURL+"/.well-known/jmap", nil)
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}
	req.SetBasicAuth(email, password)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("connecting to stalwart: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("stalwart returned status %d", resp.StatusCode)
	}

	var jmapSession struct {
		PrimaryAccounts map[string]string `json:"primaryAccounts"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jmapSession); err != nil {
		return "", fmt.Errorf("decoding JMAP session: %w", err)
	}

	// The primary account for mail capability is the user's account ID.
	accountID, ok := jmapSession.PrimaryAccounts["urn:ietf:params:jmap:mail"]
	if !ok {
		return "", fmt.Errorf("no mail account found in JMAP session")
	}
	return accountID, nil
}
