package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"webmail/internal/db"
	"webmail/internal/middleware"
	"webmail/internal/session"

	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

const (
	totpSetupKeyPrefix = "totp-setup:"
	totpSetupTTL       = 10 * time.Minute
	appPasswordPrefix  = "$app$"
)

// SecurityHandler manages TOTP 2FA and app passwords.
type SecurityHandler struct {
	httpClient *http.Client
	rdb        redis.Cmdable
	queries    *db.Queries
	log        zerolog.Logger
}

// NewSecurityHandler creates a new security handler.
func NewSecurityHandler(rdb redis.Cmdable, queries *db.Queries, log zerolog.Logger) *SecurityHandler {
	return &SecurityHandler{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		rdb:        rdb,
		queries:    queries,
		log:        log.With().Str("component", "security-handler").Logger(),
	}
}

// --- TOTP ---

// TOTPStatus handles GET /api/security/totp/status.
func (h *SecurityHandler) TOTPStatus(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	secrets, err := h.getStalwartSecrets(r.Context(), sess)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get stalwart secrets")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	enabled := false
	for _, s := range secrets {
		if strings.HasPrefix(s, "otpauth://") {
			enabled = true
			break
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled": enabled,
	})
}

// TOTPSetup handles POST /api/security/totp/setup.
func (h *SecurityHandler) TOTPSetup(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	// Generate TOTP key.
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Webmail",
		AccountName: sess.Email,
		Period:      30,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to generate TOTP key")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"totp_generation_failed"})
		return
	}

	// Store the secret temporarily in Valkey until confirmed.
	redisKey := totpSetupKeyPrefix + sess.Email
	if err := h.rdb.Set(r.Context(), redisKey, key.URL(), totpSetupTTL).Err(); err != nil {
		h.log.Error().Err(err).Msg("failed to store TOTP setup secret")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"secret": key.Secret(),
		"url":    key.URL(),
	})
}

// TOTPConfirm handles POST /api/security/totp/confirm.
func (h *SecurityHandler) TOTPConfirm(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(req.Code) != 6 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_code"})
		return
	}

	// Retrieve the pending TOTP secret from Valkey.
	redisKey := totpSetupKeyPrefix + sess.Email
	otpauthURL, err := h.rdb.Get(r.Context(), redisKey).Result()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"no_pending_setup"})
		return
	}

	// Parse and validate the code.
	key, err := otp.NewKeyFromURL(otpauthURL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"invalid_totp_key"})
		return
	}

	if !totp.Validate(req.Code, key.Secret()) {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_code"})
		return
	}

	// Add the otpauth:// URI to Stalwart's secrets.
	if err := h.patchStalwartSecrets(r.Context(), sess, "addItem", otpauthURL); err != nil {
		h.log.Error().Err(err).Msg("failed to enable TOTP in Stalwart")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"stalwart_error"})
		return
	}

	// Clean up Valkey.
	h.rdb.Del(r.Context(), redisKey)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled": true,
	})
}

// TOTPDisable handles DELETE /api/security/totp.
func (h *SecurityHandler) TOTPDisable(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	// Find and remove the otpauth:// secret.
	secrets, err := h.getStalwartSecrets(r.Context(), sess)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	for _, s := range secrets {
		if strings.HasPrefix(s, "otpauth://") {
			if err := h.patchStalwartSecrets(r.Context(), sess, "removeItem", s); err != nil {
				h.log.Error().Err(err).Msg("failed to disable TOTP")
				writeJSON(w, http.StatusInternalServerError, errorResponse{"stalwart_error"})
				return
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- App Passwords ---

// AppPasswordList handles GET /api/security/app-passwords.
func (h *SecurityHandler) AppPasswordList(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	passwords, err := h.queries.ListAppPasswords(r.Context(), sess.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to list app passwords")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	writeJSON(w, http.StatusOK, passwords)
}

// AppPasswordCreate handles POST /api/security/app-passwords.
func (h *SecurityHandler) AppPasswordCreate(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 100 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_name"})
		return
	}

	// Generate a random password.
	pwBytes := make([]byte, 16)
	if _, err := rand.Read(pwBytes); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}
	password := hex.EncodeToString(pwBytes)

	// Generate an ID for tracking.
	idBytes := make([]byte, 8)
	rand.Read(idBytes) //nolint:errcheck
	id := hex.EncodeToString(idBytes)

	// Store in Stalwart as a tagged secret: $app$id$name$password
	secretValue := fmt.Sprintf("%s%s$%s", appPasswordPrefix, id, password)
	if err := h.patchStalwartSecrets(r.Context(), sess, "addItem", secretValue); err != nil {
		h.log.Error().Err(err).Msg("failed to add app password to Stalwart")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"stalwart_error"})
		return
	}

	// Store metadata in webmail DB (name + id, NOT the password).
	if err := h.queries.CreateAppPassword(r.Context(), id, sess.Email, name); err != nil {
		h.log.Error().Err(err).Msg("failed to store app password metadata")
		// Best-effort rollback from Stalwart.
		_ = h.patchStalwartSecrets(r.Context(), sess, "removeItem", secretValue)
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	// Format password as groups for readability: xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx
	formatted := formatPassword(password)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":       id,
		"name":     name,
		"password": formatted,
	})
}

// AppPasswordDelete handles DELETE /api/security/app-passwords/{id}.
func (h *SecurityHandler) AppPasswordDelete(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_id"})
		return
	}

	// Find the matching secret in Stalwart to remove it.
	secrets, err := h.getStalwartSecrets(r.Context(), sess)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	prefix := appPasswordPrefix + id + "$"
	for _, s := range secrets {
		if strings.HasPrefix(s, prefix) {
			if err := h.patchStalwartSecrets(r.Context(), sess, "removeItem", s); err != nil {
				h.log.Error().Err(err).Msg("failed to remove app password from Stalwart")
				writeJSON(w, http.StatusInternalServerError, errorResponse{"stalwart_error"})
				return
			}
			break
		}
	}

	// Remove from DB.
	if err := h.queries.DeleteAppPassword(r.Context(), id, sess.Email); err != nil {
		h.log.Warn().Err(err).Msg("failed to delete app password from DB")
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Stalwart helpers ---

func (h *SecurityHandler) getStalwartSecrets(ctx context.Context, sess *session.SessionData) ([]string, error) {
	url := fmt.Sprintf("%s/api/principal/%s", sess.StalwartURL, sess.Email)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth("admin", sess.StalwartToken)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stalwart returned %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			Secrets []string `json:"secrets"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1*1024*1024)).Decode(&result); err != nil {
		return nil, err
	}

	return result.Data.Secrets, nil
}

func (h *SecurityHandler) patchStalwartSecrets(ctx context.Context, sess *session.SessionData, action, value string) error {
	ops := []map[string]interface{}{
		{"action": action, "field": "secrets", "value": value},
	}
	body, err := json.Marshal(ops)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/principal/%s", sess.StalwartURL, sess.Email)
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth("admin", sess.StalwartToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("stalwart PATCH failed (%d): %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func formatPassword(pw string) string {
	var parts []string
	for i := 0; i < len(pw); i += 4 {
		end := i + 4
		if end > len(pw) {
			end = len(pw)
		}
		parts = append(parts, pw[i:end])
	}
	return strings.Join(parts, "-")
}
