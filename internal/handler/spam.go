package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"webmail/internal/middleware"
	"webmail/internal/session"

	"github.com/rs/zerolog"
)

// SpamHandler handles spam training endpoints.
type SpamHandler struct {
	httpClient *http.Client
	log        zerolog.Logger
}

// NewSpamHandler creates a new spam training handler.
func NewSpamHandler(log zerolog.Logger) *SpamHandler {
	return &SpamHandler{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		log:        log.With().Str("component", "spam-handler").Logger(),
	}
}

// Train handles POST /api/spam/train.
// Fetches raw RFC822 blobs for each email and trains Stalwart's spam filter.
func (h *SpamHandler) Train(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EmailIDs []string `json:"emailIds"`
		Type     string   `json:"type"` // "spam" or "ham"
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(req.EmailIDs) == 0 || (req.Type != "spam" && req.Type != "ham") {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	// Step 1: Fetch blobIds for the given email IDs via JMAP Email/get.
	blobIDs, err := h.fetchBlobIDs(sess, req.EmailIDs)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to fetch blob IDs")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"jmap_error"})
		return
	}

	// Step 2: For each blob, download raw message and train.
	trained := 0
	for _, blobID := range blobIDs {
		rawMsg, err := h.downloadBlob(sess, blobID)
		if err != nil {
			h.log.Warn().Err(err).Str("blobId", blobID).Msg("failed to download blob")
			continue
		}

		if err := h.trainMessage(sess, req.Type, rawMsg); err != nil {
			h.log.Warn().Err(err).Str("type", req.Type).Msg("failed to train message")
			continue
		}
		trained++
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"trained": trained,
		"total":   len(req.EmailIDs),
	})
}

// fetchBlobIDs calls JMAP Email/get to get the blobId for each email.
func (h *SpamHandler) fetchBlobIDs(sess *session.SessionData, emailIDs []string) ([]string, error) {
	jmapReq := map[string]interface{}{
		"using": []string{
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:mail",
		},
		"methodCalls": []interface{}{
			[]interface{}{
				"Email/get",
				map[string]interface{}{
					"ids":        emailIDs,
					"properties": []string{"blobId"},
				},
				"e0",
			},
		},
	}

	body, err := json.Marshal(jmapReq)
	if err != nil {
		return nil, fmt.Errorf("marshaling JMAP request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, sess.StalwartURL+"/jmap", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating JMAP request: %w", err)
	}
	req.SetBasicAuth(sess.Email, sess.Password)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("JMAP request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JMAP returned status %d", resp.StatusCode)
	}

	var jmapResp struct {
		MethodResponses [][]json.RawMessage `json:"methodResponses"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jmapResp); err != nil {
		return nil, fmt.Errorf("decoding JMAP response: %w", err)
	}

	if len(jmapResp.MethodResponses) == 0 || len(jmapResp.MethodResponses[0]) < 2 {
		return nil, fmt.Errorf("unexpected JMAP response structure")
	}

	var getResult struct {
		List []struct {
			BlobID string `json:"blobId"`
		} `json:"list"`
	}
	if err := json.Unmarshal(jmapResp.MethodResponses[0][1], &getResult); err != nil {
		return nil, fmt.Errorf("decoding Email/get result: %w", err)
	}

	blobIDs := make([]string, 0, len(getResult.List))
	for _, e := range getResult.List {
		if e.BlobID != "" {
			blobIDs = append(blobIDs, e.BlobID)
		}
	}
	return blobIDs, nil
}

// downloadBlob fetches a raw RFC822 blob from Stalwart using user credentials.
func (h *SpamHandler) downloadBlob(sess *session.SessionData, blobID string) ([]byte, error) {
	url := fmt.Sprintf("%s/jmap/download/%s/%s/email.eml?accept=message/rfc822", sess.StalwartURL, sess.AccountID, blobID)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(sess.Email, sess.Password)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("blob download returned status %d", resp.StatusCode)
	}

	// Limit to 50MB to prevent abuse.
	return io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
}

// trainMessage sends raw message data to Stalwart's spam training endpoint.
func (h *SpamHandler) trainMessage(sess *session.SessionData, trainType string, rawMsg []byte) error {
	url := fmt.Sprintf("%s/api/spam-filter/train/%s/%s", sess.StalwartURL, trainType, sess.Email)

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(rawMsg))
	if err != nil {
		return err
	}
	req.SetBasicAuth("admin", sess.StalwartToken)
	req.Header.Set("Content-Type", "message/rfc822")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("train API returned status %d", resp.StatusCode)
	}

	return nil
}
