package handler

import (
	"context"
	"crypto/sha1"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"webmail/internal/db"
	"webmail/internal/middleware"

	"github.com/rs/zerolog"
)

// PGPHandler handles PGP public key operations.
type PGPHandler struct {
	queries *db.Queries
	log     zerolog.Logger
}

// NewPGPHandler creates a new PGP handler.
func NewPGPHandler(queries *db.Queries, log zerolog.Logger) *PGPHandler {
	return &PGPHandler{queries: queries, log: log}
}

// GetKey handles GET /api/pgp/key (own key).
func (h *PGPHandler) GetKey(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	key, err := h.queries.GetPGPKey(r.Context(), sess.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get PGP key")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}
	if key == nil {
		writeJSON(w, http.StatusNotFound, errorResponse{"no_pgp_key"})
		return
	}

	w.Header().Set("Content-Type", "application/pgp-keys")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(*key)) //nolint:errcheck
}

// PutKey handles PUT /api/pgp/key (own key).
func (h *PGPHandler) PutKey(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}
	if len(body) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"empty_key"})
		return
	}

	if err := h.queries.UpsertPGPKey(r.Context(), sess.Email, string(body)); err != nil {
		h.log.Error().Err(err).Msg("failed to save PGP key")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DeleteKey handles DELETE /api/pgp/key (own key).
func (h *PGPHandler) DeleteKey(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	if err := h.queries.DeletePGPKey(r.Context(), sess.Email); err != nil {
		h.log.Error().Err(err).Msg("failed to delete PGP key")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Lookup handles GET /api/pgp/lookup?email=... (search own DB, then WKD fallback).
func (h *PGPHandler) Lookup(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	email := r.URL.Query().Get("email")
	if email == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_email"})
		return
	}

	// Check webmail DB first.
	key, err := h.queries.GetPGPKey(r.Context(), email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to lookup PGP key")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}
	if key != nil {
		w.Header().Set("Content-Type", "application/pgp-keys")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(*key)) //nolint:errcheck
		return
	}

	// Fallback: WKD proxy lookup.
	wkdKey, err := lookupWKD(r.Context(), email)
	if err != nil {
		h.log.Debug().Err(err).Str("email", email).Msg("WKD lookup failed")
		writeJSON(w, http.StatusNotFound, errorResponse{"key_not_found"})
		return
	}

	w.Header().Set("Content-Type", "application/pgp-keys")
	w.WriteHeader(http.StatusOK)
	w.Write(wkdKey) //nolint:errcheck
}

// lookupWKD performs a Web Key Directory lookup for the given email.
func lookupWKD(ctx context.Context, email string) ([]byte, error) {
	atIdx := strings.LastIndex(email, "@")
	if atIdx < 0 {
		return nil, fmt.Errorf("invalid email for WKD lookup")
	}
	local := email[:atIdx]
	domain := email[atIdx+1:]

	// Reject reserved/private domains to prevent SSRF.
	if isReservedDomain(domain) {
		return nil, fmt.Errorf("WKD lookup refused for reserved domain")
	}

	hash := wkdHash(local)

	// Try the direct method: https://<domain>/.well-known/openpgpkey/hu/<hash>
	wkdURL := fmt.Sprintf("https://%s/.well-known/openpgpkey/hu/%s?l=%s",
		domain, hash, url.QueryEscape(local))

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wkdURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("WKD returned status %d", resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 256*1024))
}

// isReservedDomain returns true if the domain resolves to a loopback, private,
// or otherwise reserved address that must not be used for outbound HTTP requests.
func isReservedDomain(domain string) bool {
	d := strings.ToLower(strings.TrimSuffix(domain, "."))
	reserved := []string{"localhost", "localhost.localdomain", "local", "internal", "invalid", "test", "example"}
	for _, r := range reserved {
		if d == r || strings.HasSuffix(d, "."+r) {
			return true
		}
	}
	// Reject raw IPs and IPv6 brackets.
	if net.ParseIP(d) != nil || strings.HasPrefix(d, "[") {
		return true
	}
	return false
}

// wkdHash computes the WKD hash (SHA-1 of lowercase local part, z-base-32 encoded).
func wkdHash(localPart string) string {
	h := sha1.Sum([]byte(strings.ToLower(localPart)))
	return zBase32Encode(h[:])
}

// z-base-32 alphabet as defined in RFC 6189.
const zBase32Alphabet = "ybndrfg8ejkmcpqxot1uwisza345h769"

// zBase32Encode encodes bytes using z-base-32 encoding.
func zBase32Encode(data []byte) string {
	if len(data) == 0 {
		return ""
	}

	var result strings.Builder
	var buffer uint64
	var bitsLeft int

	for _, b := range data {
		buffer = (buffer << 8) | uint64(b)
		bitsLeft += 8
		for bitsLeft >= 5 {
			bitsLeft -= 5
			idx := (buffer >> uint(bitsLeft)) & 0x1F
			result.WriteByte(zBase32Alphabet[idx])
		}
	}

	if bitsLeft > 0 {
		idx := (buffer << uint(5-bitsLeft)) & 0x1F
		result.WriteByte(zBase32Alphabet[idx])
	}

	return result.String()
}
