package activity

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// Activities holds dependencies for Temporal activity implementations.
type Activities struct {
	DB     *pgxpool.Pool
	Valkey *redis.Client
	Log    zerolog.Logger
	Client *http.Client
}

// NewActivities creates a new Activities struct.
func NewActivities(db *pgxpool.Pool, valkey *redis.Client, log zerolog.Logger) *Activities {
	return &Activities{
		DB:     db,
		Valkey: valkey,
		Log:    log.With().Str("component", "activities").Logger(),
		Client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				IdleConnTimeout:     90 * time.Second,
				MaxIdleConnsPerHost: 10,
			},
		},
	}
}

// Credentials holds Stalwart connection info for a user.
type Credentials struct {
	Email       string
	Password    string
	AccountID   string
	StalwartURL string
}

// ProgressParams defines parameters for publishing progress.
type ProgressParams struct {
	Email    string
	TaskID   string
	TaskType string
	Progress float64
	Detail   string
	Status   string // "running" | "completed" | "failed"
}

// JMAPBatchUpdateParams defines parameters for batch Email/set updates.
type JMAPBatchUpdateParams struct {
	Creds   Credentials
	Updates map[string]map[string]interface{} // emailId -> patch
}

// JMAPBatchDestroyParams defines parameters for batch Email/set destroy.
type JMAPBatchDestroyParams struct {
	Creds    Credentials
	EmailIDs []string
}

// FetchIdsParams defines parameters for querying email IDs.
type FetchIdsParams struct {
	Creds     Credentials
	MailboxID string
	Limit     int // 0 = all
}

// FetchBlobsParams defines parameters for downloading email blobs.
type FetchBlobsParams struct {
	Creds    Credentials
	EmailIDs []string
}

// EmailBlob holds a downloaded email in RFC 5322 format.
type EmailBlob struct {
	EmailID string
	Data    []byte
}

// CreateEmailsParams defines parameters for importing emails.
type CreateEmailsParams struct {
	Creds     Credentials
	MailboxID string
	Messages  [][]byte // RFC 5322 format messages
}

// GetUserCredentials fetches credentials from the session store.
// In the webmail architecture, credentials come from the session context,
// so we pass them through workflow params rather than looking them up from DB.
// This activity is a no-op placeholder — credentials are passed in workflow params.
func (a *Activities) GetUserCredentials(ctx context.Context, email string) (*Credentials, error) {
	// Credentials are passed through workflow parameters from the authenticated session.
	// This is a structural placeholder.
	return nil, fmt.Errorf("credentials must be passed via workflow params")
}

// PublishProgress publishes a TaskProgress event to Valkey pub/sub.
func (a *Activities) PublishProgress(ctx context.Context, params ProgressParams) error {
	channel := fmt.Sprintf("webmail:progress:%s", params.Email)

	msg := map[string]interface{}{
		"type":     "taskProgress",
		"taskId":   params.TaskID,
		"taskType": params.TaskType,
		"progress": params.Progress,
		"detail":   params.Detail,
		"status":   params.Status,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshaling progress: %w", err)
	}

	return a.Valkey.Publish(ctx, channel, string(data)).Err()
}

// JMAPBatchUpdate sends a JMAP Email/set request with batch updates.
func (a *Activities) JMAPBatchUpdate(ctx context.Context, params JMAPBatchUpdateParams) error {
	if len(params.Updates) == 0 {
		return nil
	}

	request := map[string]interface{}{
		"using": []string{
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:mail",
		},
		"methodCalls": []interface{}{
			[]interface{}{
				"Email/set",
				map[string]interface{}{
					"accountId": params.Creds.AccountID,
					"update":    params.Updates,
				},
				"0",
			},
		},
	}

	return a.doJMAPRequest(ctx, params.Creds, request)
}

// JMAPBatchDestroy sends a JMAP Email/set request with destroy.
func (a *Activities) JMAPBatchDestroy(ctx context.Context, params JMAPBatchDestroyParams) error {
	if len(params.EmailIDs) == 0 {
		return nil
	}

	request := map[string]interface{}{
		"using": []string{
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:mail",
		},
		"methodCalls": []interface{}{
			[]interface{}{
				"Email/set",
				map[string]interface{}{
					"accountId": params.Creds.AccountID,
					"destroy":   params.EmailIDs,
				},
				"0",
			},
		},
	}

	return a.doJMAPRequest(ctx, params.Creds, request)
}

// JMAPFetchEmailIds queries email IDs in a mailbox.
func (a *Activities) JMAPFetchEmailIds(ctx context.Context, params FetchIdsParams) ([]string, error) {
	var allIDs []string
	position := 0
	batchSize := 100

	for {
		request := map[string]interface{}{
			"using": []string{
				"urn:ietf:params:jmap:core",
				"urn:ietf:params:jmap:mail",
			},
			"methodCalls": []interface{}{
				[]interface{}{
					"Email/query",
					map[string]interface{}{
						"accountId": params.Creds.AccountID,
						"filter": map[string]interface{}{
							"inMailbox": params.MailboxID,
						},
						"sort": []map[string]interface{}{
							{"property": "receivedAt", "isAscending": false},
						},
						"position": position,
						"limit":    batchSize,
					},
					"0",
				},
			},
		}

		respBody, err := a.doJMAPRequestWithResponse(ctx, params.Creds, request)
		if err != nil {
			return nil, err
		}

		var resp jmapResponse
		if err := json.Unmarshal(respBody, &resp); err != nil {
			return nil, fmt.Errorf("parsing JMAP response: %w", err)
		}

		if len(resp.MethodResponses) == 0 {
			break
		}

		result, ok := resp.MethodResponses[0][1].(map[string]interface{})
		if !ok {
			break
		}

		idsRaw, ok := result["ids"].([]interface{})
		if !ok || len(idsRaw) == 0 {
			break
		}

		for _, id := range idsRaw {
			if s, ok := id.(string); ok {
				allIDs = append(allIDs, s)
			}
		}

		if params.Limit > 0 && len(allIDs) >= params.Limit {
			allIDs = allIDs[:params.Limit]
			break
		}

		if len(idsRaw) < batchSize {
			break
		}

		position += len(idsRaw)
	}

	return allIDs, nil
}

// JMAPFetchEmailBlobs downloads email blobs (RFC 5322 format) for export.
func (a *Activities) JMAPFetchEmailBlobs(ctx context.Context, params FetchBlobsParams) ([]EmailBlob, error) {
	// First, get the blobIds for each email
	request := map[string]interface{}{
		"using": []string{
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:mail",
		},
		"methodCalls": []interface{}{
			[]interface{}{
				"Email/get",
				map[string]interface{}{
					"accountId":  params.Creds.AccountID,
					"ids":        params.EmailIDs,
					"properties": []string{"id", "blobId"},
				},
				"0",
			},
		},
	}

	respBody, err := a.doJMAPRequestWithResponse(ctx, params.Creds, request)
	if err != nil {
		return nil, err
	}

	var resp jmapResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return nil, fmt.Errorf("parsing JMAP response: %w", err)
	}

	if len(resp.MethodResponses) == 0 {
		return nil, fmt.Errorf("empty JMAP response")
	}

	result, ok := resp.MethodResponses[0][1].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected JMAP response format")
	}

	list, ok := result["list"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected JMAP list format")
	}

	var blobs []EmailBlob
	for _, item := range list {
		emailMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		emailID, _ := emailMap["id"].(string)
		blobID, _ := emailMap["blobId"].(string)
		if emailID == "" || blobID == "" {
			continue
		}

		// Download blob
		downloadURL := fmt.Sprintf("%s/jmap/download/%s/%s/",
			params.Creds.StalwartURL, params.Creds.AccountID, blobID)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
		if err != nil {
			return nil, fmt.Errorf("creating blob request: %w", err)
		}
		req.SetBasicAuth(params.Creds.Email, params.Creds.Password)

		blobResp, err := a.Client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("downloading blob %s: %w", blobID, err)
		}

		data, err := io.ReadAll(blobResp.Body)
		blobResp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("reading blob %s: %w", blobID, err)
		}

		if blobResp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("blob download returned %d for %s", blobResp.StatusCode, blobID)
		}

		blobs = append(blobs, EmailBlob{EmailID: emailID, Data: data})
	}

	return blobs, nil
}

// JMAPCreateEmails imports emails via JMAP Email/import.
func (a *Activities) JMAPCreateEmails(ctx context.Context, params CreateEmailsParams) error {
	for _, msg := range params.Messages {
		// Upload blob first
		uploadURL := fmt.Sprintf("%s/jmap/upload/%s/", params.Creds.StalwartURL, params.Creds.AccountID)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(msg))
		if err != nil {
			return fmt.Errorf("creating upload request: %w", err)
		}
		req.Header.Set("Content-Type", "message/rfc822")
		req.SetBasicAuth(params.Creds.Email, params.Creds.Password)

		uploadResp, err := a.Client.Do(req)
		if err != nil {
			return fmt.Errorf("uploading email blob: %w", err)
		}

		var uploadResult struct {
			BlobID string `json:"blobId"`
		}
		if err := json.NewDecoder(uploadResp.Body).Decode(&uploadResult); err != nil {
			uploadResp.Body.Close()
			return fmt.Errorf("parsing upload response: %w", err)
		}
		uploadResp.Body.Close()

		if uploadResp.StatusCode != http.StatusOK && uploadResp.StatusCode != http.StatusCreated {
			return fmt.Errorf("upload returned status %d", uploadResp.StatusCode)
		}

		// Import via Email/import
		importReq := map[string]interface{}{
			"using": []string{
				"urn:ietf:params:jmap:core",
				"urn:ietf:params:jmap:mail",
			},
			"methodCalls": []interface{}{
				[]interface{}{
					"Email/import",
					map[string]interface{}{
						"accountId": params.Creds.AccountID,
						"emails": map[string]interface{}{
							"imp0": map[string]interface{}{
								"blobId":     uploadResult.BlobID,
								"mailboxIds": map[string]bool{params.MailboxID: true},
							},
						},
					},
					"0",
				},
			},
		}

		if err := a.doJMAPRequest(ctx, params.Creds, importReq); err != nil {
			return fmt.Errorf("importing email: %w", err)
		}
	}

	return nil
}

// doJMAPRequest sends a JMAP request and checks for success.
func (a *Activities) doJMAPRequest(ctx context.Context, creds Credentials, request interface{}) error {
	_, err := a.doJMAPRequestWithResponse(ctx, creds, request)
	return err
}

// doJMAPRequestWithResponse sends a JMAP request and returns the response body.
func (a *Activities) doJMAPRequestWithResponse(ctx context.Context, creds Credentials, request interface{}) ([]byte, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshaling JMAP request: %w", err)
	}

	stalwartURL := creds.StalwartURL + "/jmap/"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, stalwartURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating JMAP request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(creds.Email, creds.Password)

	resp, err := a.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("JMAP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading JMAP response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("JMAP returned %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

type jmapResponse struct {
	MethodResponses [][]interface{} `json:"methodResponses"`
}

// JMAPSendEmailParams defines parameters for sending an email via EmailSubmission/set.
type JMAPSendEmailParams struct {
	Creds      Credentials
	EmailID    string
	IdentityID string
}

// JMAPSendEmail sends an existing draft email via JMAP EmailSubmission/set.
func (a *Activities) JMAPSendEmail(ctx context.Context, params JMAPSendEmailParams) error {
	request := map[string]interface{}{
		"using": []string{
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:mail",
			"urn:ietf:params:jmap:submission",
		},
		"methodCalls": []interface{}{
			[]interface{}{
				"EmailSubmission/set",
				map[string]interface{}{
					"accountId": params.Creds.AccountID,
					"create": map[string]interface{}{
						"sub": map[string]interface{}{
							"emailId":    params.EmailID,
							"identityId": params.IdentityID,
						},
					},
					"onSuccessUpdateEmail": map[string]interface{}{
						"#sub": map[string]interface{}{
							"keywords/$draft": nil,
							"keywords/$seen":  true,
						},
					},
				},
				"0",
			},
		},
	}

	respBody, err := a.doJMAPRequestWithResponse(ctx, params.Creds, request)
	if err != nil {
		return fmt.Errorf("JMAP EmailSubmission/set failed: %w", err)
	}

	var resp jmapResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return fmt.Errorf("parsing JMAP response: %w", err)
	}

	// Check for errors in method responses.
	for _, methodResp := range resp.MethodResponses {
		if len(methodResp) < 2 {
			continue
		}
		methodName, _ := methodResp[0].(string)
		if methodName == "error" {
			result, _ := methodResp[1].(map[string]interface{})
			desc, _ := result["description"].(string)
			return fmt.Errorf("JMAP error: %s", desc)
		}
		result, ok := methodResp[1].(map[string]interface{})
		if !ok {
			continue
		}
		if notCreated, ok := result["notCreated"].(map[string]interface{}); ok && len(notCreated) > 0 {
			for _, v := range notCreated {
				errObj, _ := v.(map[string]interface{})
				desc, _ := errObj["description"].(string)
				typ, _ := errObj["type"].(string)
				if desc != "" {
					return fmt.Errorf("EmailSubmission failed: %s", desc)
				}
				return fmt.Errorf("EmailSubmission failed: %s", typ)
			}
		}
	}

	return nil
}
