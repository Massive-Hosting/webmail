package hosting

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"webmail/internal/model"
)

// CoreAPIClient communicates with the hosting platform's core API.
// Used only for Stalwart context resolution (which Stalwart instance serves a given email).
type CoreAPIClient struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
}

// NewCoreAPIClient creates a client for the hosting core API.
func NewCoreAPIClient(baseURL, apiKey string) *CoreAPIClient {
	return &CoreAPIClient{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: baseURL,
		apiKey:  apiKey,
	}
}

// GetStalwartContext resolves the Stalwart URL and token for an email account.
// Called on first login for a new email address. Result is cached in webmail DB.
func (c *CoreAPIClient) GetStalwartContext(ctx context.Context, email string) (*model.StalwartContext, error) {
	url := fmt.Sprintf("%s/email-accounts/by-email/%s/stalwart-context", c.baseURL, email)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("X-API-Key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling core API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("core API returned status %d", resp.StatusCode)
	}

	var sc model.StalwartContext
	if err := json.NewDecoder(resp.Body).Decode(&sc); err != nil {
		return nil, fmt.Errorf("decoding stalwart context: %w", err)
	}
	return &sc, nil
}
