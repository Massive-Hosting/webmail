package activity

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/mail"
	"strings"

	"webmail/internal/credcrypt"
	"webmail/internal/db"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
)

// MaxMessageSize is the maximum size of a single message to import (25MB).
const MaxMessageSize = 25 * 1024 * 1024

// IMAPTestConnectionParams defines parameters for testing an IMAP connection.
type IMAPTestConnectionParams struct {
	Host              string
	Port              int
	Username          string
	EncryptedPassword string
	SSL               bool
}

// IMAPTestConnectionResult is the result of an IMAP connection test.
type IMAPTestConnectionResult struct {
	Success      bool     `json:"success"`
	Capabilities []string `json:"capabilities,omitempty"`
	Error        string   `json:"error,omitempty"`
}

// IMAPTestConnection tests an IMAP connection by logging in and checking capabilities.
func (a *Activities) IMAPTestConnection(ctx context.Context, params IMAPTestConnectionParams) (*IMAPTestConnectionResult, error) {
	password, err := credcrypt.Decrypt(a.EncryptionKey, params.EncryptedPassword)
	if err != nil {
		return &IMAPTestConnectionResult{Error: "failed to decrypt password"}, nil
	}

	client, err := a.dialIMAP(ctx, params.Host, params.Port, params.SSL)
	if err != nil {
		return &IMAPTestConnectionResult{Error: fmt.Sprintf("connection failed: %v", err)}, nil
	}
	defer client.Close()

	if err := client.Login(params.Username, password).Wait(); err != nil {
		return &IMAPTestConnectionResult{Error: fmt.Sprintf("login failed: %v", err)}, nil
	}

	caps := client.Caps()
	var capList []string
	for c := range caps {
		capList = append(capList, string(c))
	}

	if err := client.Logout().Wait(); err != nil {
		a.Log.Warn().Err(err).Msg("IMAP logout failed")
	}

	return &IMAPTestConnectionResult{
		Success:      true,
		Capabilities: capList,
	}, nil
}

// IMAPFolder represents an IMAP folder with message count.
type IMAPFolder struct {
	Name          string `json:"name"`
	Delimiter     string `json:"delimiter"`
	MessageCount  uint32 `json:"messageCount"`
	Flags         []string `json:"flags,omitempty"`
	NoSelect      bool   `json:"noSelect"`
}

// IMAPListFoldersParams defines parameters for listing IMAP folders.
type IMAPListFoldersParams struct {
	Host              string
	Port              int
	Username          string
	EncryptedPassword string
	SSL               bool
}

// IMAPListFolders lists all folders on an IMAP server with message counts.
func (a *Activities) IMAPListFolders(ctx context.Context, params IMAPListFoldersParams) ([]IMAPFolder, error) {
	password, err := credcrypt.Decrypt(a.EncryptionKey, params.EncryptedPassword)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt password: %w", err)
	}

	client, err := a.dialIMAP(ctx, params.Host, params.Port, params.SSL)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer client.Close()

	if err := client.Login(params.Username, password).Wait(); err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}
	defer client.Logout().Wait() //nolint:errcheck

	// List all mailboxes.
	listCmd := client.List("", "*", nil)
	mailboxes, err := listCmd.Collect()
	if err != nil {
		return nil, fmt.Errorf("LIST failed: %w", err)
	}

	var folders []IMAPFolder
	for _, mbox := range mailboxes {
		noSelect := false
		var flags []string
		for _, attr := range mbox.Attrs {
			flags = append(flags, string(attr))
			if attr == imap.MailboxAttrNoSelect {
				noSelect = true
			}
		}

		folder := IMAPFolder{
			Name:     mbox.Mailbox,
			Delimiter: string(mbox.Delim),
			NoSelect: noSelect,
			Flags:    flags,
		}

		// Get message count via STATUS if selectable.
		if !noSelect {
			statusCmd := client.Status(mbox.Mailbox, &imap.StatusOptions{
				NumMessages: true,
			})
			statusData, err := statusCmd.Wait()
			if err == nil && statusData.NumMessages != nil {
				folder.MessageCount = *statusData.NumMessages
			}
		}

		folders = append(folders, folder)
	}

	return folders, nil
}

// IMAPFetchBatchParams defines parameters for fetching a batch of messages.
type IMAPFetchBatchParams struct {
	Host              string
	Port              int
	Username          string
	EncryptedPassword string
	SSL               bool
	Folder            string
	LastUID           uint32
	BatchSize         int
}

// IMAPFetchedMessage holds a fetched IMAP message.
type IMAPFetchedMessage struct {
	UID       uint32 `json:"uid"`
	MessageID string `json:"messageId"`
	Data      []byte `json:"data"`
	Size      int    `json:"size"`
}

// IMAPFetchBatchResult is the result of a batch fetch.
type IMAPFetchBatchResult struct {
	Messages []IMAPFetchedMessage `json:"messages"`
	LastUID  uint32               `json:"lastUID"`
	HasMore  bool                 `json:"hasMore"`
}

// IMAPFetchBatch fetches a batch of messages from an IMAP folder by UID range.
func (a *Activities) IMAPFetchBatch(ctx context.Context, params IMAPFetchBatchParams) (*IMAPFetchBatchResult, error) {
	password, err := credcrypt.Decrypt(a.EncryptionKey, params.EncryptedPassword)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt password: %w", err)
	}

	client, err := a.dialIMAP(ctx, params.Host, params.Port, params.SSL)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer client.Close()

	if err := client.Login(params.Username, password).Wait(); err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}
	defer client.Logout().Wait() //nolint:errcheck

	// Select the folder.
	if _, err := client.Select(params.Folder, nil).Wait(); err != nil {
		return nil, fmt.Errorf("SELECT %q failed: %w", params.Folder, err)
	}

	// Build UID range: (lastUID+1):*
	startUID := params.LastUID + 1
	uidSet := imap.UIDSet{}
	uidSet.AddRange(imap.UID(startUID), 0) // 0 means "*" (max)

	// Fetch body and envelope.
	fetchOptions := &imap.FetchOptions{
		UID:         true,
		RFC822Size:  true,
		BodySection: []*imap.FetchItemBodySection{
			{Specifier: imap.PartSpecifierHeader},
			{Specifier: imap.PartSpecifierNone},
		},
	}

	fetchCmd := client.Fetch(uidSet, fetchOptions)

	var messages []IMAPFetchedMessage
	for {
		msg := fetchCmd.Next()
		if msg == nil {
			break
		}

		var uid imap.UID
		var body []byte
		var messageID string

		// Collect body sections.
		for {
			item := msg.Next()
			if item == nil {
				break
			}
			switch data := item.(type) {
			case imapclient.FetchItemDataUID:
				uid = data.UID
			case imapclient.FetchItemDataBodySection:
				sectionData, err := io.ReadAll(data.Literal)
				if err != nil {
					a.Log.Warn().Err(err).Uint32("uid", uint32(uid)).Msg("failed to read body section")
					continue
				}
				if data.Section.Specifier == imap.PartSpecifierNone {
					body = sectionData
				} else if data.Section.Specifier == imap.PartSpecifierHeader {
					// Parse Message-ID from headers.
					headerMsg, err := mail.ReadMessage(strings.NewReader(string(sectionData)))
					if err == nil {
						messageID = headerMsg.Header.Get("Message-Id")
					}
				}
			}
		}

		if body == nil {
			continue
		}

		// Skip oversized messages.
		if len(body) > MaxMessageSize {
			a.Log.Warn().Uint32("uid", uint32(uid)).Int("size", len(body)).Msg("skipping oversized message")
			continue
		}

		messages = append(messages, IMAPFetchedMessage{
			UID:       uint32(uid),
			MessageID: messageID,
			Data:      body,
			Size:      len(body),
		})

		if len(messages) >= params.BatchSize {
			break
		}
	}

	if err := fetchCmd.Close(); err != nil {
		a.Log.Warn().Err(err).Msg("IMAP FETCH close error")
	}

	result := &IMAPFetchBatchResult{
		Messages: messages,
	}

	if len(messages) > 0 {
		result.LastUID = messages[len(messages)-1].UID
		result.HasMore = len(messages) >= params.BatchSize
	}

	return result, nil
}

// CheckDuplicateMessageIDsParams defines parameters for checking duplicate Message-IDs.
type CheckDuplicateMessageIDsParams struct {
	Creds      Credentials
	MessageIDs []string
}

// CheckDuplicateMessageIDs queries JMAP for existing emails with the given Message-IDs.
// Returns the set of Message-IDs that already exist.
func (a *Activities) CheckDuplicateMessageIDs(ctx context.Context, params CheckDuplicateMessageIDsParams) ([]string, error) {
	if len(params.MessageIDs) == 0 {
		return nil, nil
	}

	var duplicates []string
	for _, msgID := range params.MessageIDs {
		if msgID == "" {
			continue
		}

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
							"header": []string{"Message-Id", msgID},
						},
						"limit": 1,
					},
					"0",
				},
			},
		}

		respBody, err := a.doJMAPRequestWithResponse(ctx, params.Creds, request)
		if err != nil {
			continue // Skip on error, don't block import.
		}

		var resp jmapResponse
		if err := json.Unmarshal(respBody, &resp); err != nil {
			continue
		}

		if len(resp.MethodResponses) > 0 {
			result, ok := resp.MethodResponses[0][1].(map[string]interface{})
			if ok {
				if ids, ok := result["ids"].([]interface{}); ok && len(ids) > 0 {
					duplicates = append(duplicates, msgID)
				}
			}
		}
	}

	return duplicates, nil
}

// UpdateIMAPImportProgressParams defines parameters for updating import progress.
type UpdateIMAPImportProgressParams struct {
	JobID         string
	TotalMessages int
	Imported      int
	Skipped       int
	Failed        int
	FolderConfig  json.RawMessage
	// For Valkey pub/sub progress:
	Email    string
	TaskID   string
	Progress float64
	Detail   string
}

// UpdateIMAPImportProgress writes progress to DB and publishes to Valkey.
func (a *Activities) UpdateIMAPImportProgress(ctx context.Context, params UpdateIMAPImportProgressParams) error {
	queries := db.NewQueries(a.DB)
	if err := queries.UpdateIMAPImportProgress(ctx, params.JobID, params.TotalMessages, params.Imported, params.Skipped, params.Failed, params.FolderConfig); err != nil {
		a.Log.Error().Err(err).Str("jobId", params.JobID).Msg("failed to update import progress in DB")
	}

	// Publish progress via Valkey pub/sub.
	return a.PublishProgress(ctx, ProgressParams{
		Email:    params.Email,
		TaskID:   params.TaskID,
		TaskType: "imap-import",
		Progress: params.Progress,
		Detail:   params.Detail,
		Status:   "running",
	})
}

// RecordIMAPImportFailureParams defines parameters for recording a failure.
type RecordIMAPImportFailureParams struct {
	JobID      string
	Folder     string
	MessageUID *int64
	MessageID  *string
	Reason     string
	Detail     *string
}

// RecordIMAPImportFailure inserts a failure record into the database.
func (a *Activities) RecordIMAPImportFailure(ctx context.Context, params RecordIMAPImportFailureParams) error {
	queries := db.NewQueries(a.DB)
	return queries.CreateIMAPImportFailure(ctx, params.JobID, params.Folder, params.MessageUID, params.MessageID, params.Reason, params.Detail)
}

// CompleteIMAPImportJobParams defines parameters for completing an import job.
type CompleteIMAPImportJobParams struct {
	JobID        string
	Status       string
	ErrorMessage *string
}

// CompleteIMAPImportJob marks an import job as completed or failed in the database.
func (a *Activities) CompleteIMAPImportJob(ctx context.Context, params CompleteIMAPImportJobParams) error {
	queries := db.NewQueries(a.DB)
	return queries.CompleteIMAPImportJob(ctx, params.JobID, params.Status, params.ErrorMessage)
}

// dialIMAP creates an IMAP client connection.
func (a *Activities) dialIMAP(_ context.Context, host string, port int, ssl bool) (*imapclient.Client, error) {
	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))

	options := &imapclient.Options{
		TLSConfig: &tls.Config{
			ServerName: host,
		},
	}

	if ssl {
		client, err := imapclient.DialTLS(addr, options)
		if err != nil {
			return nil, fmt.Errorf("TLS dial %s: %w", addr, err)
		}
		return client, nil
	}

	client, err := imapclient.DialInsecure(addr, options)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", addr, err)
	}

	return client, nil
}

// IMAPConnParams holds common IMAP connection parameters passed through workflows.
type IMAPConnParams struct {
	Host              string
	Port              int
	Username          string
	EncryptedPassword string
	SSL               bool
}

