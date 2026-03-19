package activity

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// UploadBlobParams for uploading data as a blob.
type UploadBlobParams struct {
	Creds       Credentials
	Data        []byte
	ContentType string
}

// UploadBlobResult contains the blob ID of the uploaded data.
type UploadBlobResult struct {
	BlobID string `json:"blobId"`
}

// UploadBlob uploads data to Stalwart as a blob and returns the blob ID.
func (a *Activities) UploadBlob(ctx context.Context, params UploadBlobParams) (*UploadBlobResult, error) {
	password, err := a.decryptPassword(params.Creds)
	if err != nil {
		return nil, fmt.Errorf("decrypting credentials: %w", err)
	}

	uploadURL := fmt.Sprintf("%s/jmap/upload/%s/", params.Creds.StalwartURL, params.Creds.AccountID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(params.Data))
	if err != nil {
		return nil, fmt.Errorf("creating upload request: %w", err)
	}
	req.Header.Set("Content-Type", params.ContentType)
	req.SetBasicAuth(params.Creds.Email, password)

	resp, err := a.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("uploading blob: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("upload returned %d: %s", resp.StatusCode, string(body))
	}

	var result UploadBlobResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("parsing upload response: %w", err)
	}

	return &result, nil
}

// DownloadBlobParams for downloading a blob.
type DownloadBlobParams struct {
	Creds  Credentials
	BlobID string
}

// DownloadBlob downloads a blob from Stalwart.
func (a *Activities) DownloadBlob(ctx context.Context, params DownloadBlobParams) ([]byte, error) {
	password, err := a.decryptPassword(params.Creds)
	if err != nil {
		return nil, fmt.Errorf("decrypting credentials: %w", err)
	}

	downloadURL := fmt.Sprintf("%s/jmap/download/%s/%s/",
		params.Creds.StalwartURL, params.Creds.AccountID, params.BlobID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating download request: %w", err)
	}
	req.SetBasicAuth(params.Creds.Email, password)

	resp, err := a.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("downloading blob: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading blob: %w", err)
	}

	return data, nil
}

// ParseMbox parses an mbox file into individual RFC 5322 messages.
func (a *Activities) ParseMbox(ctx context.Context, data []byte) ([][]byte, error) {
	var messages [][]byte
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024) // 10MB max line

	var current bytes.Buffer
	inMessage := false

	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "From ") {
			if inMessage && current.Len() > 0 {
				msg := make([]byte, current.Len())
				copy(msg, current.Bytes())
				messages = append(messages, msg)
				current.Reset()
			}
			inMessage = true
			continue
		}

		if inMessage {
			current.WriteString(line)
			current.WriteByte('\n')
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanning mbox: %w", err)
	}

	// Don't forget the last message.
	if inMessage && current.Len() > 0 {
		messages = append(messages, current.Bytes())
	}

	return messages, nil
}
