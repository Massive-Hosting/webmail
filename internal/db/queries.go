package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"webmail/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Queries provides database operations for the webmail.
type Queries struct {
	pool *pgxpool.Pool
}

// NewQueries creates a new Queries instance.
func NewQueries(pool *pgxpool.Pool) *Queries {
	return &Queries{pool: pool}
}

// GetPartnerByHostname looks up partner and brand info by hostname.
func (q *Queries) GetPartnerByHostname(ctx context.Context, hostname string) (*model.PartnerInfo, error) {
	var info model.PartnerInfo
	err := q.pool.QueryRow(ctx,
		`SELECT p.name, b.name, b.logo_url, p.primary_color
		 FROM partners p
		 JOIN brands b ON b.id = p.brand_id
		 WHERE p.hostname = $1 AND p.status = 'active'`,
		hostname,
	).Scan(&info.PartnerName, &info.BrandName, &info.LogoURL, &info.PrimaryColor)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// GetStalwartContext retrieves cached Stalwart context for an email address.
func (q *Queries) GetStalwartContext(ctx context.Context, email string) (*model.StalwartContext, error) {
	var sc model.StalwartContext
	var url, token *string
	err := q.pool.QueryRow(ctx,
		`SELECT stalwart_url, stalwart_token FROM user_preferences WHERE email = $1`,
		email,
	).Scan(&url, &token)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if url == nil || token == nil || *url == "" {
		return nil, nil
	}
	sc.StalwartURL = *url
	sc.StalwartToken = *token
	return &sc, nil
}

// UpsertStalwartContext caches Stalwart context for an email address.
func (q *Queries) UpsertStalwartContext(ctx context.Context, email string, sc *model.StalwartContext) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO user_preferences (email, stalwart_url, stalwart_token)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (email) DO UPDATE SET
		   stalwart_url = EXCLUDED.stalwart_url,
		   stalwart_token = EXCLUDED.stalwart_token,
		   updated_at = now()`,
		email, sc.StalwartURL, sc.StalwartToken,
	)
	return err
}

// GetPreferences retrieves user preferences JSON for an email address.
func (q *Queries) GetPreferences(ctx context.Context, email string) (json.RawMessage, error) {
	var prefs json.RawMessage
	err := q.pool.QueryRow(ctx,
		`SELECT preferences FROM user_preferences WHERE email = $1`,
		email,
	).Scan(&prefs)
	if errors.Is(err, pgx.ErrNoRows) {
		return json.RawMessage("{}"), nil
	}
	if err != nil {
		return nil, err
	}
	return prefs, nil
}

// UpsertPreferences stores user preferences JSON.
func (q *Queries) UpsertPreferences(ctx context.Context, email string, prefs json.RawMessage) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO user_preferences (email, preferences)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO UPDATE SET
		   preferences = EXCLUDED.preferences,
		   updated_at = now()`,
		email, prefs,
	)
	return err
}

// GetPGPKey retrieves the PGP public key for an email address.
func (q *Queries) GetPGPKey(ctx context.Context, email string) (*string, error) {
	var key *string
	err := q.pool.QueryRow(ctx,
		`SELECT pgp_public_key FROM user_preferences WHERE email = $1`,
		email,
	).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return key, nil
}

// UpsertPGPKey stores a PGP public key for an email address.
func (q *Queries) UpsertPGPKey(ctx context.Context, email, key string) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO user_preferences (email, pgp_public_key)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO UPDATE SET
		   pgp_public_key = EXCLUDED.pgp_public_key,
		   updated_at = now()`,
		email, key,
	)
	return err
}

// DeletePGPKey removes the PGP public key for an email address.
func (q *Queries) DeletePGPKey(ctx context.Context, email string) error {
	_, err := q.pool.Exec(ctx,
		`UPDATE user_preferences SET pgp_public_key = NULL, updated_at = now() WHERE email = $1`,
		email,
	)
	return err
}

// --- App Passwords ---

// AppPassword represents an app password metadata entry.
type AppPassword struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

// ListAppPasswords returns all app password metadata for an email.
func (q *Queries) ListAppPasswords(ctx context.Context, email string) ([]AppPassword, error) {
	rows, err := q.pool.Query(ctx,
		`SELECT id, name, created_at FROM app_passwords WHERE email = $1 ORDER BY created_at DESC`,
		email,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []AppPassword
	for rows.Next() {
		var ap AppPassword
		var createdAt interface{}
		if err := rows.Scan(&ap.ID, &ap.Name, &createdAt); err != nil {
			return nil, err
		}
		ap.CreatedAt = fmt.Sprintf("%v", createdAt)
		result = append(result, ap)
	}
	if result == nil {
		result = []AppPassword{}
	}
	return result, rows.Err()
}

// CreateAppPassword stores app password metadata.
func (q *Queries) CreateAppPassword(ctx context.Context, id, email, name string) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO app_passwords (id, email, name) VALUES ($1, $2, $3)`,
		id, email, name,
	)
	return err
}

// DeleteAppPassword removes app password metadata.
func (q *Queries) DeleteAppPassword(ctx context.Context, id, email string) error {
	_, err := q.pool.Exec(ctx,
		`DELETE FROM app_passwords WHERE id = $1 AND email = $2`,
		id, email,
	)
	return err
}

// --- Event Participants ---

// EventParticipant represents an attendee of a calendar event.
type EventParticipant struct {
	EventID string `json:"eventId"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Role    string `json:"role"`
	Status  string `json:"status"`
}

// UpsertEventParticipants stores or replaces participants for a calendar event.
func (q *Queries) UpsertEventParticipants(ctx context.Context, eventID, ownerEmail string, participants []EventParticipant) error {
	// Delete existing participants for this event.
	_, err := q.pool.Exec(ctx, `DELETE FROM event_participants WHERE event_id = $1 AND owner_email = $2`, eventID, ownerEmail)
	if err != nil {
		return err
	}

	for _, p := range participants {
		_, err := q.pool.Exec(ctx,
			`INSERT INTO event_participants (event_id, email, owner_email, name, role, status) VALUES ($1, $2, $3, $4, $5, $6)`,
			eventID, p.Email, ownerEmail, p.Name, p.Role, p.Status,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// GetEventParticipants returns all participants for a calendar event.
func (q *Queries) GetEventParticipants(ctx context.Context, eventID, ownerEmail string) ([]EventParticipant, error) {
	rows, err := q.pool.Query(ctx,
		`SELECT event_id, email, name, role, status FROM event_participants WHERE event_id = $1 AND owner_email = $2`,
		eventID, ownerEmail,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []EventParticipant
	for rows.Next() {
		var p EventParticipant
		if err := rows.Scan(&p.EventID, &p.Email, &p.Name, &p.Role, &p.Status); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if result == nil {
		result = []EventParticipant{}
	}
	return result, rows.Err()
}

// GetBatchEventParticipants returns participants for multiple events at once.
func (q *Queries) GetBatchEventParticipants(ctx context.Context, eventIDs []string, ownerEmail string) (map[string][]EventParticipant, error) {
	rows, err := q.pool.Query(ctx,
		`SELECT event_id, email, name, role, status FROM event_participants WHERE event_id = ANY($1) AND owner_email = $2`,
		eventIDs, ownerEmail,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]EventParticipant)
	for rows.Next() {
		var p EventParticipant
		if err := rows.Scan(&p.EventID, &p.Email, &p.Name, &p.Role, &p.Status); err != nil {
			return nil, err
		}
		result[p.EventID] = append(result[p.EventID], p)
	}
	return result, rows.Err()
}

// DeleteEventParticipants removes all participants for a calendar event.
func (q *Queries) DeleteEventParticipants(ctx context.Context, eventID, ownerEmail string) error {
	_, err := q.pool.Exec(ctx, `DELETE FROM event_participants WHERE event_id = $1 AND owner_email = $2`, eventID, ownerEmail)
	return err
}

// --- IMAP Import Jobs ---

// IMAPImportJob represents an IMAP import job.
type IMAPImportJob struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	IMAPHost      string `json:"imapHost"`
	IMAPPort      int    `json:"imapPort"`
	IMAPUser      string `json:"imapUser"`
	IMAPSSL       bool   `json:"imapSsl"`
	Status        string `json:"status"`
	FolderConfig  json.RawMessage `json:"folderConfig"`
	TotalMessages int    `json:"totalMessages"`
	ImportedCount int    `json:"importedCount"`
	SkippedCount  int    `json:"skippedCount"`
	FailedCount   int    `json:"failedCount"`
	ErrorMessage  *string `json:"errorMessage,omitempty"`
	StartedAt     string `json:"startedAt"`
	CompletedAt   *string `json:"completedAt,omitempty"`
	CreatedAt     string `json:"createdAt"`
}

// IMAPImportFailure represents a single import failure record.
type IMAPImportFailure struct {
	ID        int64  `json:"id"`
	JobID     string `json:"jobId"`
	Folder    string `json:"folder"`
	MessageUID *int64 `json:"messageUid,omitempty"`
	MessageID *string `json:"messageId,omitempty"`
	Reason    string `json:"reason"`
	Detail    *string `json:"detail,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// CreateIMAPImportJob inserts a new IMAP import job.
func (q *Queries) CreateIMAPImportJob(ctx context.Context, job *IMAPImportJob) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO imap_import_jobs (id, email, imap_host, imap_port, imap_user, imap_ssl, status, folder_config, total_messages)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		job.ID, job.Email, job.IMAPHost, job.IMAPPort, job.IMAPUser, job.IMAPSSL, job.Status, job.FolderConfig, job.TotalMessages,
	)
	return err
}

// GetIMAPImportJob retrieves a single import job by ID and email.
func (q *Queries) GetIMAPImportJob(ctx context.Context, id, email string) (*IMAPImportJob, error) {
	var job IMAPImportJob
	err := q.pool.QueryRow(ctx,
		`SELECT id, email, imap_host, imap_port, imap_user, imap_ssl, status, folder_config,
		        total_messages, imported_count, skipped_count, failed_count, error_message,
		        started_at, completed_at, created_at
		 FROM imap_import_jobs WHERE id = $1 AND email = $2`,
		id, email,
	).Scan(&job.ID, &job.Email, &job.IMAPHost, &job.IMAPPort, &job.IMAPUser, &job.IMAPSSL,
		&job.Status, &job.FolderConfig, &job.TotalMessages, &job.ImportedCount,
		&job.SkippedCount, &job.FailedCount, &job.ErrorMessage,
		&job.StartedAt, &job.CompletedAt, &job.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// ListIMAPImportJobs returns all import jobs for an email, newest first.
func (q *Queries) ListIMAPImportJobs(ctx context.Context, email string) ([]IMAPImportJob, error) {
	rows, err := q.pool.Query(ctx,
		`SELECT id, email, imap_host, imap_port, imap_user, imap_ssl, status, folder_config,
		        total_messages, imported_count, skipped_count, failed_count, error_message,
		        started_at, completed_at, created_at
		 FROM imap_import_jobs WHERE email = $1 ORDER BY created_at DESC`,
		email,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []IMAPImportJob
	for rows.Next() {
		var job IMAPImportJob
		if err := rows.Scan(&job.ID, &job.Email, &job.IMAPHost, &job.IMAPPort, &job.IMAPUser, &job.IMAPSSL,
			&job.Status, &job.FolderConfig, &job.TotalMessages, &job.ImportedCount,
			&job.SkippedCount, &job.FailedCount, &job.ErrorMessage,
			&job.StartedAt, &job.CompletedAt, &job.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, job)
	}
	if result == nil {
		result = []IMAPImportJob{}
	}
	return result, rows.Err()
}

// UpdateIMAPImportProgress updates counters and folder_config for a running job.
func (q *Queries) UpdateIMAPImportProgress(ctx context.Context, id string, totalMessages, imported, skipped, failed int, folderConfig json.RawMessage) error {
	_, err := q.pool.Exec(ctx,
		`UPDATE imap_import_jobs
		 SET total_messages = $2, imported_count = $3, skipped_count = $4, failed_count = $5, folder_config = $6
		 WHERE id = $1`,
		id, totalMessages, imported, skipped, failed, folderConfig,
	)
	return err
}

// CompleteIMAPImportJob marks a job as completed or failed.
func (q *Queries) CompleteIMAPImportJob(ctx context.Context, id, status string, errorMessage *string) error {
	_, err := q.pool.Exec(ctx,
		`UPDATE imap_import_jobs SET status = $2, error_message = $3, completed_at = now() WHERE id = $1`,
		id, status, errorMessage,
	)
	return err
}

// CreateIMAPImportFailure records a single message import failure.
func (q *Queries) CreateIMAPImportFailure(ctx context.Context, jobID, folder string, messageUID *int64, messageID *string, reason string, detail *string) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO imap_import_failures (job_id, folder, message_uid, message_id, reason, detail)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		jobID, folder, messageUID, messageID, reason, detail,
	)
	return err
}

// ListIMAPImportFailures returns failures for a job.
func (q *Queries) ListIMAPImportFailures(ctx context.Context, jobID string) ([]IMAPImportFailure, error) {
	rows, err := q.pool.Query(ctx,
		`SELECT id, job_id, folder, message_uid, message_id, reason, detail, created_at
		 FROM imap_import_failures WHERE job_id = $1 ORDER BY created_at ASC`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []IMAPImportFailure
	for rows.Next() {
		var f IMAPImportFailure
		if err := rows.Scan(&f.ID, &f.JobID, &f.Folder, &f.MessageUID, &f.MessageID, &f.Reason, &f.Detail, &f.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, f)
	}
	if result == nil {
		result = []IMAPImportFailure{}
	}
	return result, rows.Err()
}

// --- Domain Settings ---

// DomainSettings holds per-domain feature flags.
type DomainSettings struct {
	Domain           string `json:"domain"`
	FreeBusyEnabled  bool   `json:"freebusyEnabled"`
	DirectoryEnabled bool   `json:"directoryEnabled"`
}

// GetDomainSettings returns settings for a domain. Returns defaults if no row exists.
func (q *Queries) GetDomainSettings(ctx context.Context, domain string) (*DomainSettings, error) {
	var ds DomainSettings
	ds.Domain = domain
	err := q.pool.QueryRow(ctx,
		`SELECT freebusy_enabled, directory_enabled FROM domain_settings WHERE domain = $1`, domain,
	).Scan(&ds.FreeBusyEnabled, &ds.DirectoryEnabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return &ds, nil // defaults: false, false
	}
	if err != nil {
		return nil, err
	}
	return &ds, nil
}

// UpsertDomainSettings creates or updates domain settings.
func (q *Queries) UpsertDomainSettings(ctx context.Context, ds *DomainSettings) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO domain_settings (domain, freebusy_enabled, directory_enabled)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (domain) DO UPDATE SET
		   freebusy_enabled = EXCLUDED.freebusy_enabled,
		   directory_enabled = EXCLUDED.directory_enabled,
		   updated_at = now()`,
		ds.Domain, ds.FreeBusyEnabled, ds.DirectoryEnabled,
	)
	return err
}
