package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"webmail/internal/db"
	"webmail/internal/middleware"
	"webmail/internal/session"

	"github.com/rs/zerolog"
)

// AvailabilityHandler provides free/busy lookups and directory search for same-domain users.
type AvailabilityHandler struct {
	httpClient *http.Client
	queries    *db.Queries
	log        zerolog.Logger
}

// NewAvailabilityHandler creates a new availability handler.
func NewAvailabilityHandler(queries *db.Queries, log zerolog.Logger) *AvailabilityHandler {
	return &AvailabilityHandler{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		queries:    queries,
		log:        log.With().Str("component", "availability-handler").Logger(),
	}
}

// --- Free/Busy ---

type busySlot struct {
	Start    string `json:"start"`
	Duration string `json:"duration"`
}

// FreeBusy handles POST /api/availability.
func (h *AvailabilityHandler) FreeBusy(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Email string `json:"email"`
		Start string `json:"start"` // ISO date or datetime
		End   string `json:"end"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.Email == "" || req.Start == "" || req.End == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	// Same-domain check.
	requesterDomain := domainFromEmail(sess.Email)
	targetDomain := domainFromEmail(req.Email)
	if requesterDomain == "" || targetDomain == "" || requesterDomain != targetDomain {
		writeJSON(w, http.StatusOK, map[string]interface{}{"busySlots": []busySlot{}})
		return
	}

	// Check if free/busy is enabled for this domain.
	settings, err := h.queries.GetDomainSettings(r.Context(), requesterDomain)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get domain settings")
		writeJSON(w, http.StatusOK, map[string]interface{}{"busySlots": []busySlot{}})
		return
	}
	if !settings.FreeBusyEnabled {
		writeJSON(w, http.StatusOK, map[string]interface{}{"busySlots": []busySlot{}})
		return
	}

	// Resolve target user's JMAP accountId.
	accountID, err := h.resolveAccountID(r.Context(), sess, req.Email)
	if err != nil {
		h.log.Warn().Err(err).Str("email", req.Email).Msg("failed to resolve account ID")
		writeJSON(w, http.StatusOK, map[string]interface{}{"busySlots": []busySlot{}})
		return
	}

	// Query target user's calendar events via admin auth.
	slots, err := h.queryBusySlots(r.Context(), sess, accountID, req.Start, req.End)
	if err != nil {
		h.log.Warn().Err(err).Msg("failed to query calendar events")
		writeJSON(w, http.StatusOK, map[string]interface{}{"busySlots": []busySlot{}})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"busySlots": slots})
}

// --- Directory Search ---

type directoryEntry struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

// Directory handles POST /api/directory/search.
func (h *AvailabilityHandler) Directory(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.Query == "" || len(req.Query) < 1 {
		writeJSON(w, http.StatusOK, []directoryEntry{})
		return
	}
	if req.Limit <= 0 || req.Limit > 20 {
		req.Limit = 10
	}

	requesterDomain := domainFromEmail(sess.Email)
	if requesterDomain == "" {
		writeJSON(w, http.StatusOK, []directoryEntry{})
		return
	}

	// Check if directory is enabled for this domain.
	settings, err := h.queries.GetDomainSettings(r.Context(), requesterDomain)
	if err != nil || !settings.DirectoryEnabled {
		writeJSON(w, http.StatusOK, []directoryEntry{})
		return
	}

	// Query Stalwart's principal list via admin API.
	entries, err := h.searchPrincipals(r.Context(), sess, requesterDomain, req.Query, req.Limit)
	if err != nil {
		h.log.Warn().Err(err).Msg("failed to search principals")
		writeJSON(w, http.StatusOK, []directoryEntry{})
		return
	}

	writeJSON(w, http.StatusOK, entries)
}

// --- Domain Settings Admin ---

// GetDomainSettings handles GET /api/admin/domain-settings/{domain}.
func (h *AvailabilityHandler) GetDomainSettings(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	domain := domainFromEmail(sess.Email)
	if domain == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_domain"})
		return
	}

	settings, err := h.queries.GetDomainSettings(r.Context(), domain)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	writeJSON(w, http.StatusOK, settings)
}

// PutDomainSettings handles PUT /api/admin/domain-settings.
func (h *AvailabilityHandler) PutDomainSettings(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	domain := domainFromEmail(sess.Email)
	if domain == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_domain"})
		return
	}

	var req struct {
		FreeBusyEnabled  bool `json:"freebusyEnabled"`
		DirectoryEnabled bool `json:"directoryEnabled"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	ds := &db.DomainSettings{
		Domain:           domain,
		FreeBusyEnabled:  req.FreeBusyEnabled,
		DirectoryEnabled: req.DirectoryEnabled,
	}
	if err := h.queries.UpsertDomainSettings(r.Context(), ds); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"internal_error"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Helpers ---

func domainFromEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return ""
	}
	return strings.ToLower(email[at+1:])
}

func (h *AvailabilityHandler) resolveAccountID(ctx context.Context, sess *session.SessionData, targetEmail string) (string, error) {
	url := fmt.Sprintf("%s/api/principal/%s", sess.StalwartURL, targetEmail)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.SetBasicAuth("admin", sess.StalwartToken)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("principal lookup returned %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			ID uint32 `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&result); err != nil {
		return "", err
	}

	return crockfordBase32Encode(result.Data.ID), nil
}

func (h *AvailabilityHandler) queryBusySlots(ctx context.Context, sess *session.SessionData, accountID, start, end string) ([]busySlot, error) {
	jmapReq := map[string]interface{}{
		"using": []string{"urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"},
		"methodCalls": []interface{}{
			[]interface{}{
				"CalendarEvent/query",
				map[string]interface{}{
					"accountId": accountID,
					"filter": map[string]interface{}{
						"after":  start,
						"before": end,
					},
					"limit": 200,
				},
				"q0",
			},
			[]interface{}{
				"CalendarEvent/get",
				map[string]interface{}{
					"accountId": accountID,
					"#ids": map[string]interface{}{
						"resultOf": "q0",
						"name":     "CalendarEvent/query",
						"path":     "/ids",
					},
					"properties": []string{"start", "duration", "showWithoutTime", "freeBusyStatus"},
				},
				"g0",
			},
		},
	}

	body, err := json.Marshal(jmapReq)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sess.StalwartURL+"/jmap/", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth("admin", sess.StalwartToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JMAP returned %d", resp.StatusCode)
	}

	var jmapResp struct {
		MethodResponses [][]json.RawMessage `json:"methodResponses"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 10*1024*1024)).Decode(&jmapResp); err != nil {
		return nil, err
	}

	// Find the CalendarEvent/get response.
	for _, mr := range jmapResp.MethodResponses {
		if len(mr) < 2 {
			continue
		}
		var methodName string
		json.Unmarshal(mr[0], &methodName)
		if methodName != "CalendarEvent/get" {
			continue
		}

		var getResult struct {
			List []struct {
				Start           string `json:"start"`
				Duration        string `json:"duration"`
				ShowWithoutTime bool   `json:"showWithoutTime"`
				FreeBusyStatus  string `json:"freeBusyStatus"`
			} `json:"list"`
		}
		if err := json.Unmarshal(mr[1], &getResult); err != nil {
			return nil, err
		}

		var slots []busySlot
		for _, e := range getResult.List {
			// Skip "free" events and all-day events.
			if e.FreeBusyStatus == "free" || e.ShowWithoutTime {
				continue
			}
			dur := e.Duration
			if dur == "" {
				dur = "PT1H"
			}
			slots = append(slots, busySlot{Start: e.Start, Duration: dur})
		}
		return slots, nil
	}

	return nil, nil
}

func (h *AvailabilityHandler) searchPrincipals(ctx context.Context, sess *session.SessionData, domain, query string, limit int) ([]directoryEntry, error) {
	url := fmt.Sprintf("%s/api/principal", sess.StalwartURL)
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
		return nil, fmt.Errorf("principal list returned %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			Items []struct {
				Name        string   `json:"name"`
				Description string   `json:"description"`
				Type        string   `json:"type"`
				Emails      []string `json:"emails"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1*1024*1024)).Decode(&result); err != nil {
		return nil, err
	}

	queryLower := strings.ToLower(query)
	var entries []directoryEntry
	for _, p := range result.Data.Items {
		if p.Type != "individual" {
			continue
		}
		// Filter to same domain and matching query.
		for _, email := range p.Emails {
			if domainFromEmail(email) != domain {
				continue
			}
			// Don't include the requester themselves.
			if email == sess.Email {
				continue
			}
			name := p.Description
			if name == "" {
				name = p.Name
			}
			if strings.Contains(strings.ToLower(name), queryLower) ||
				strings.Contains(strings.ToLower(email), queryLower) {
				entries = append(entries, directoryEntry{Email: email, Name: name})
				if len(entries) >= limit {
					return entries, nil
				}
			}
		}
	}

	return entries, nil
}

// Crockford base32 encoding for Stalwart JMAP accountId resolution.
const crockfordAlphabet = "0123456789abcdefghjkmnpqrstvwxyz"

func crockfordBase32Encode(n uint32) string {
	if n == 0 {
		return "0"
	}
	var buf [7]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = crockfordAlphabet[n%32]
		n /= 32
	}
	return string(buf[i:])
}
