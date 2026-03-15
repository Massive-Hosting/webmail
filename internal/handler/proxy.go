package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"webmail/internal/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
)

// ProxyHandler forwards JMAP requests to Stalwart.
type ProxyHandler struct {
	client *http.Client
	log    zerolog.Logger
}

// NewProxyHandler creates a new JMAP proxy handler.
func NewProxyHandler(log zerolog.Logger) *ProxyHandler {
	return &ProxyHandler{
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				MaxIdleConnsPerHost: 20,
			},
		},
		log: log,
	}
}

// Allowed JMAP capabilities.
var allowedCapabilities = map[string]bool{
	"urn:ietf:params:jmap:core":             true,
	"urn:ietf:params:jmap:mail":             true,
	"urn:ietf:params:jmap:submission":       true,
	"urn:ietf:params:jmap:vacationresponse": true,
	"urn:ietf:params:jmap:contacts":         true,
	"urn:ietf:params:jmap:calendars":        true,
	"urn:ietf:params:jmap:blob":             true,
	"urn:ietf:params:jmap:sieve":            true,
}

// Blocked capabilities.
var blockedCapabilities = map[string]bool{
	"urn:ietf:params:jmap:admin": true,
}

// jmapRequest represents the structure of a JMAP request.
type jmapRequest struct {
	Using       []string        `json:"using"`
	MethodCalls [][]interface{} `json:"methodCalls"`
}

// JMAP handles POST /api/jmap.
func (h *ProxyHandler) JMAP(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	// Read and limit request body.
	body, err := io.ReadAll(io.LimitReader(r.Body, 1*1024*1024)) // 1MB limit
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	// Parse and validate JMAP request.
	var jmapReq jmapRequest
	if err := json.Unmarshal(body, &jmapReq); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_jmap_request"})
		return
	}

	if err := h.validateJMAPRequest(&jmapReq, sess.AccountID); err != nil {
		writeJSON(w, http.StatusForbidden, errorResponse{err.Error()})
		return
	}

	// Forward to Stalwart.
	stalwartURL := sess.StalwartURL + "/jmap/"
	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, stalwartURL, io.NopCloser(io.LimitReader(r.Body, 0)))
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create stalwart request")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	// Use the original body since we already read it.
	proxyReq.Body = io.NopCloser(bytesReader(body))
	proxyReq.ContentLength = int64(len(body))
	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.SetBasicAuth(sess.Email, sess.Password)

	resp, err := h.client.Do(proxyReq)
	if err != nil {
		h.log.Error().Err(err).Msg("stalwart request failed")
		writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
		return
	}
	defer resp.Body.Close()

	// Stream response back.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}

// BlobDownload handles GET /api/jmap/blob/{blobId}.
// Proxies blob download requests to the Stalwart JMAP download endpoint.
func (h *ProxyHandler) BlobDownload(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	blobID := chi.URLParam(r, "blobId")
	if blobID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_blob_id"})
		return
	}

	downloadURL := fmt.Sprintf("%s/jmap/download/%s/%s/",
		sess.StalwartURL, sess.AccountID, blobID)

	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, downloadURL, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}
	proxyReq.SetBasicAuth(sess.Email, sess.Password)

	resp, err := h.client.Do(proxyReq)
	if err != nil {
		h.log.Error().Err(err).Msg("stalwart blob download failed")
		writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		writeJSON(w, resp.StatusCode, errorResponse{"blob_not_found"})
		return
	}

	ct := resp.Header.Get("Content-Type")
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}

	io.Copy(w, resp.Body) //nolint:errcheck
}

// BlobUpload handles POST /api/jmap/upload.
// Proxies raw blob upload requests to the Stalwart JMAP upload endpoint.
func (h *ProxyHandler) BlobUpload(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	uploadURL := fmt.Sprintf("%s/jmap/upload/%s/", sess.StalwartURL, sess.AccountID)

	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, uploadURL, r.Body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	ct := r.Header.Get("Content-Type")
	if ct != "" {
		proxyReq.Header.Set("Content-Type", ct)
	}
	proxyReq.SetBasicAuth(sess.Email, sess.Password)

	resp, err := h.client.Do(proxyReq)
	if err != nil {
		h.log.Error().Err(err).Msg("stalwart blob upload failed")
		writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}

func (h *ProxyHandler) validateJMAPRequest(req *jmapRequest, accountID string) error {
	if len(req.Using) == 0 {
		return fmt.Errorf("missing_using")
	}
	if len(req.MethodCalls) == 0 {
		return fmt.Errorf("missing_method_calls")
	}

	// Check capabilities.
	for _, cap := range req.Using {
		if blockedCapabilities[cap] {
			return fmt.Errorf("blocked_capability: %s", cap)
		}
		if !allowedCapabilities[cap] {
			return fmt.Errorf("unknown_capability: %s", cap)
		}
	}

	// Check accountId isolation.
	for _, call := range req.MethodCalls {
		if len(call) < 2 {
			continue
		}
		args, ok := call[1].(map[string]interface{})
		if !ok {
			continue
		}
		if aid, ok := args["accountId"].(string); ok {
			if aid != accountID {
				return fmt.Errorf("account_id_mismatch")
			}
		}
	}

	return nil
}

// bytesReader wraps a byte slice as an io.Reader.
type bytesReaderImpl struct {
	data []byte
	pos  int
}

func bytesReader(data []byte) *bytesReaderImpl {
	return &bytesReaderImpl{data: data}
}

func (r *bytesReaderImpl) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
