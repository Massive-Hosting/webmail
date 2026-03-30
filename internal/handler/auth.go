package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"webmail/internal/db"
	"webmail/internal/hosting"
	"webmail/internal/middleware"
	"webmail/internal/model"
	"webmail/internal/session"

	"github.com/rs/zerolog"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	store        *session.Store
	queries      *db.Queries
	coreClient   *hosting.CoreAPIClient // nil in standalone mode
	loginLimiter *middleware.LoginRateLimiter
	log          zerolog.Logger
	// Standalone mode: direct Stalwart connection
	stalwartURL   string
	stalwartToken string
}

// NewAuthHandler creates a new authentication handler.
func NewAuthHandler(
	store *session.Store,
	queries *db.Queries,
	coreClient *hosting.CoreAPIClient,
	loginLimiter *middleware.LoginRateLimiter,
	log zerolog.Logger,
) *AuthHandler {
	return &AuthHandler{
		store:        store,
		queries:      queries,
		coreClient:   coreClient,
		loginLimiter: loginLimiter,
		log:          log,
	}
}

// NewStandaloneAuthHandler creates an auth handler for standalone mode (no hosting platform).
func NewStandaloneAuthHandler(
	store *session.Store,
	queries *db.Queries,
	stalwartURL string,
	stalwartToken string,
	loginLimiter *middleware.LoginRateLimiter,
	log zerolog.Logger,
) *AuthHandler {
	return &AuthHandler{
		store:         store,
		queries:       queries,
		loginLimiter:  loginLimiter,
		log:           log,
		stalwartURL:   stalwartURL,
		stalwartToken: stalwartToken,
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
func emailDomain(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return ""
	}
	return strings.ToLower(email[at+1:])
}

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

	var sc *model.StalwartContext
	var accountID string

	if h.stalwartURL != "" {
		// Standalone mode: use configured Stalwart URL directly.
		sc = &model.StalwartContext{
			StalwartURL:   h.stalwartURL,
			StalwartToken: h.stalwartToken,
		}
		var err error
		accountID, err = validateStalwartCredentials(ctx, sc.StalwartURL, req.Email, req.Password)
		if err != nil {
			h.log.Debug().Str("email", req.Email).Msg("stalwart authentication failed")
			writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
			return
		}
		// Ensure domain_settings row exists (enable free/busy and directory by default in standalone).
		domain := emailDomain(req.Email)
		if domain != "" {
			_ = h.queries.UpsertDomainSettings(ctx, &db.DomainSettings{
				Domain:           domain,
				FreeBusyEnabled:  true,
				DirectoryEnabled: true,
			})
		}
	} else {
		// Hosted mode: resolve Stalwart context via DB cache + core API.
		var err error
		sc, err = h.queries.GetStalwartContext(ctx, req.Email)
		if err != nil {
			h.log.Error().Err(err).Msg("failed to query stalwart context cache")
		}
		if sc == nil {
			sc, err = h.coreClient.GetStalwartContext(ctx, req.Email)
			if err != nil {
				h.log.Error().Err(err).Msg("failed to resolve stalwart context from core API")
				writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
				return
			}
			if cacheErr := h.queries.UpsertStalwartContext(ctx, req.Email, sc); cacheErr != nil {
				h.log.Error().Err(cacheErr).Msg("failed to cache stalwart context")
			}
			domain := emailDomain(req.Email)
			if domain != "" {
				_ = h.queries.UpsertDomainSettings(ctx, &db.DomainSettings{
					Domain:           domain,
					FreeBusyEnabled:  sc.FreeBusyEnabled,
					DirectoryEnabled: sc.DirectoryEnabled,
				})
			}
		}

		accountID, err = validateStalwartCredentials(ctx, sc.StalwartURL, req.Email, req.Password)
		if err != nil {
			h.log.Debug().Str("email", req.Email).Msg("stalwart authentication failed")
			freshSC, freshErr := h.coreClient.GetStalwartContext(ctx, req.Email)
			if freshErr != nil {
				writeJSON(w, http.StatusUnauthorized, errorResponse{"invalid_credentials"})
				return
			}
			if freshSC.StalwartURL != sc.StalwartURL {
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
	}

	// Create session in Valkey.
	sess := &session.SessionData{
		Email:         req.Email,
		Password:      req.Password,
		AccountID:     accountID,
		StalwartURL:   sc.StalwartURL,
		StalwartToken: sc.StalwartToken,
		UAHash:        session.HashUserAgent(r.UserAgent()),
	}

	token, err := h.store.Create(ctx, sess)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create session in valkey")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	session.SetCookie(w, token, h.store.MaxAge())

	h.log.Info().Str("email", req.Email).Msg("user logged in")
	writeJSON(w, http.StatusOK, loginResponse{
		Email:     req.Email,
		AccountID: accountID,
	})
}

// Logout handles POST /api/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if token, err := session.TokenFromRequest(r); err == nil {
		if delErr := h.store.Delete(r.Context(), token); delErr != nil {
			h.log.Error().Err(delErr).Msg("failed to delete session from valkey")
		}
	}
	session.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// Session handles GET /api/auth/session.
func (h *AuthHandler) Session(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	// Sliding window TTL refresh is already done by Store.Get in the middleware.

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

	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Preserve basic auth on redirects (Stalwart v0.15+ redirects /.well-known/jmap to /jmap/session).
			if len(via) > 0 {
				req.SetBasicAuth(email, password)
			}
			return nil
		},
	}
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
