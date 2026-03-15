package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"webmail/internal/middleware"
	"webmail/internal/session"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
)

// BlobHandler handles attachment upload/download.
type BlobHandler struct {
	client        *http.Client
	maxUploadSize int64
	log           zerolog.Logger
}

// NewBlobHandler creates a new blob handler.
func NewBlobHandler(maxUploadSize int64, log zerolog.Logger) *BlobHandler {
	return &BlobHandler{
		client: &http.Client{
			Timeout: 60 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				MaxIdleConnsPerHost: 20,
			},
		},
		maxUploadSize: maxUploadSize,
		log:           log,
	}
}

// Blocked content types for upload.
var blockedUploadTypes = map[string]bool{
	"application/x-executable":    true,
	"application/x-msdos-program": true,
	"application/x-msdownload":    true,
	"application/x-sh":            true,
	"application/x-csh":           true,
	"text/html":                   true,
}

// Safe content types for inline display.
var safeInlineTypes = map[string]bool{
	"image/jpeg":                true,
	"image/png":                 true,
	"image/gif":                 true,
	"image/webp":                true,
	"image/svg+xml":             true,
	"application/octet-stream":  true, // Stalwart may return this for uploaded blobs
}

// Upload handles POST /api/blob/upload.
func (h *BlobHandler) Upload(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadSize)
	if err := r.ParseMultipartForm(h.maxUploadSize); err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorResponse{"upload_too_large"})
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck

	type uploadResult struct {
		BlobID string `json:"blobId"`
		Type   string `json:"type"`
		Size   int64  `json:"size"`
	}
	var results []uploadResult

	for _, fh := range r.MultipartForm.File["file"] {
		ct := fh.Header.Get("Content-Type")
		if blockedUploadTypes[ct] {
			writeJSON(w, http.StatusBadRequest, errorResponse{fmt.Sprintf("blocked_content_type: %s", ct)})
			return
		}

		f, err := fh.Open()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResponse{"file_read_error"})
			return
		}

		// Upload to Stalwart.
		uploadURL := fmt.Sprintf("%s/jmap/upload/%s/", sess.StalwartURL, sess.AccountID)
		proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, uploadURL, f)
		if err != nil {
			f.Close()
			writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
			return
		}
		proxyReq.Header.Set("Content-Type", ct)
		proxyReq.SetBasicAuth(sess.Email, sess.Password)

		resp, err := h.client.Do(proxyReq)
		f.Close()
		if err != nil {
			h.log.Error().Err(err).Msg("stalwart upload failed")
			writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
			return
		}

		var uploadResp struct {
			BlobID string `json:"blobId"`
			Type   string `json:"type"`
			Size   int64  `json:"size"`
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1*1024*1024))
		resp.Body.Close()
		if readErr != nil {
			writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
			return
		}
		if err := json.Unmarshal(body, &uploadResp); err != nil {
			writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
			return
		}

		results = append(results, uploadResult{
			BlobID: uploadResp.BlobID,
			Type:   uploadResp.Type,
			Size:   uploadResp.Size,
		})
	}

	writeJSON(w, http.StatusOK, results)
}

// Download handles GET /api/blob/{blobId}.
func (h *BlobHandler) Download(w http.ResponseWriter, r *http.Request) {
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

	downloadURL := fmt.Sprintf("%s/jmap/download/%s/%s/?accept=application/octet-stream",
		sess.StalwartURL, sess.AccountID, blobID)

	h.streamBlob(w, r, sess, downloadURL, "attachment")
}

// Inline handles GET /api/blob/{blobId}/inline.
func (h *BlobHandler) Inline(w http.ResponseWriter, r *http.Request) {
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

	h.streamBlob(w, r, sess, downloadURL, "inline")
}

func (h *BlobHandler) streamBlob(w http.ResponseWriter, r *http.Request, sess *session.SessionData, downloadURL, disposition string) {
	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, downloadURL, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}
	proxyReq.SetBasicAuth(sess.Email, sess.Password)

	resp, err := h.client.Do(proxyReq)
	if err != nil {
		h.log.Error().Err(err).Msg("stalwart download failed")
		writeJSON(w, http.StatusBadGateway, errorResponse{"upstream_error"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		writeJSON(w, resp.StatusCode, errorResponse{"blob_not_found"})
		return
	}

	ct := resp.Header.Get("Content-Type")

	// For inline display, only allow safe image types.
	if disposition == "inline" {
		baseCT := strings.SplitN(ct, ";", 2)[0]
		baseCT = strings.TrimSpace(baseCT)
		if !safeInlineTypes[baseCT] {
			writeJSON(w, http.StatusForbidden, errorResponse{"unsafe_content_type_for_inline"})
			return
		}
		w.Header().Set("Content-Security-Policy", "sandbox")
	}

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", disposition)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}

	io.Copy(w, resp.Body) //nolint:errcheck
}
