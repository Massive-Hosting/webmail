package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"webmail/internal/middleware"
	"webmail/internal/session"

	"github.com/rs/zerolog"
)

func makeTestSession() *session.SessionData {
	return &session.SessionData{
		Email:       "user@example.com",
		Password:    "password123",
		AccountID:   "acc-12345",
		StalwartURL: "", // will be set to mock server URL
	}
}

func withSession(ctx context.Context, sess *session.SessionData) context.Context {
	return context.WithValue(ctx, middleware.SessionContextKeyExported, sess)
}

func TestJMAPProxyValidRequest(t *testing.T) {
	// Mock Stalwart server.
	stalwart := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify basic auth.
		user, pass, ok := r.BasicAuth()
		if !ok || user != "user@example.com" || pass != "password123" {
			t.Errorf("unexpected auth: user=%q pass=%q ok=%v", user, pass, ok)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		// Echo back a JMAP response.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"methodResponses": []interface{}{
				[]interface{}{"Mailbox/get", map[string]interface{}{
					"accountId": "acc-12345",
					"list":      []interface{}{},
				}, "c1"},
			},
		})
	}))
	defer stalwart.Close()

	handler := NewProxyHandler(zerolog.Nop())

	// Valid JMAP request.
	jmapBody := map[string]interface{}{
		"using":       []string{"urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"},
		"methodCalls": []interface{}{
			[]interface{}{"Mailbox/get", map[string]interface{}{"accountId": "acc-12345"}, "c1"},
		},
	}
	body, _ := json.Marshal(jmapBody)

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader(body))
	sess := makeTestSession()
	sess.StalwartURL = stalwart.URL
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestJMAPProxyBlockedCapability(t *testing.T) {
	handler := NewProxyHandler(zerolog.Nop())

	jmapBody := map[string]interface{}{
		"using":       []string{"urn:ietf:params:jmap:core", "urn:ietf:params:jmap:admin"},
		"methodCalls": []interface{}{
			[]interface{}{"Admin/get", map[string]interface{}{}, "c1"},
		},
	}
	body, _ := json.Marshal(jmapBody)

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader(body))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", rr.Code)
	}
}

func TestJMAPProxyAccountIdMismatch(t *testing.T) {
	handler := NewProxyHandler(zerolog.Nop())

	jmapBody := map[string]interface{}{
		"using":       []string{"urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"},
		"methodCalls": []interface{}{
			[]interface{}{"Email/get", map[string]interface{}{"accountId": "other-account"}, "c1"},
		},
	}
	body, _ := json.Marshal(jmapBody)

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader(body))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", rr.Code)
	}

	var errResp errorResponse
	json.NewDecoder(rr.Body).Decode(&errResp)
	if errResp.Error != "account_id_mismatch" {
		t.Errorf("expected error 'account_id_mismatch', got %q", errResp.Error)
	}
}

func TestJMAPProxyNoSession(t *testing.T) {
	handler := NewProxyHandler(zerolog.Nop())

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader([]byte(`{}`)))
	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rr.Code)
	}
}

func TestJMAPProxyInvalidJSON(t *testing.T) {
	handler := NewProxyHandler(zerolog.Nop())

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader([]byte(`not-json`)))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}
}

func TestJMAPProxyOversizeBody(t *testing.T) {
	handler := NewProxyHandler(zerolog.Nop())

	// Create a body larger than 1MB.
	bigBody := make([]byte, 1*1024*1024+100)
	rand.Read(bigBody)

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader(bigBody))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	// Should fail because reading >1MB will give truncated data that won't parse as JSON.
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for oversize body, got %d", rr.Code)
	}
}

func TestJMAPProxySieveAllowed(t *testing.T) {
	stalwart := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"methodResponses":[]}`))
	}))
	defer stalwart.Close()

	handler := NewProxyHandler(zerolog.Nop())

	jmapBody := map[string]interface{}{
		"using":       []string{"urn:ietf:params:jmap:core", "urn:ietf:params:jmap:sieve"},
		"methodCalls": []interface{}{
			[]interface{}{"SieveScript/get", map[string]interface{}{"accountId": "acc-12345"}, "c1"},
		},
	}
	body, _ := json.Marshal(jmapBody)

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader(body))
	sess := makeTestSession()
	sess.StalwartURL = stalwart.URL
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	handler.JMAP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200 for sieve capability, got %d: %s", rr.Code, rr.Body.String())
	}
}

// TestStalwartIntegration tests against a real Stalwart instance if available.
func TestStalwartIntegration(t *testing.T) {
	stalwartURL := "http://10.10.10.200:8081"

	// Check connectivity.
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(stalwartURL + "/")
	if err != nil {
		t.Skip("Stalwart unreachable")
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Skip("Stalwart unreachable")
	}

	// Test credential validation.
	accountID, err := validateStalwartCredentials(
		context.Background(),
		stalwartURL,
		"info@acme.customer.mhst.io",
		"test1234",
	)
	if err != nil {
		t.Fatalf("stalwart authentication failed: %v", err)
	}
	if accountID == "" {
		t.Fatal("expected non-empty accountID")
	}
	t.Logf("authenticated successfully, accountID: %s", accountID)

	// Test JMAP proxy with real Stalwart.
	proxyHandler := NewProxyHandler(zerolog.Nop())
	jmapBody := map[string]interface{}{
		"using":       []string{"urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"},
		"methodCalls": []interface{}{
			[]interface{}{"Mailbox/get", map[string]interface{}{"accountId": accountID}, "c1"},
		},
	}
	body, _ := json.Marshal(jmapBody)

	req := httptest.NewRequest(http.MethodPost, "/api/jmap", bytes.NewReader(body))
	sess := &session.SessionData{
		Email:       "info@acme.customer.mhst.io",
		Password:    "test1234",
		AccountID:   accountID,
		StalwartURL: stalwartURL,
	}
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	proxyHandler.JMAP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("JMAP proxy failed: status %d, body: %s", rr.Code, rr.Body.String())
	} else {
		t.Logf("JMAP proxy succeeded, response length: %d bytes", rr.Body.Len())
	}
}
