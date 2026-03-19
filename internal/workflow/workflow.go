package workflow

import (
	"fmt"
	"time"

	"webmail/internal/activity"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

const BatchSize = 50

// activityOptions returns standard activity options for webmail workflows.
func activityOptions() workflow.ActivityOptions {
	return workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumAttempts:    3,
			MaximumInterval:    30 * time.Second,
		},
	}
}

// BulkMoveParams defines input for BulkMoveEmailsWorkflow.
type BulkMoveParams struct {
	Creds         activity.Credentials
	EmailIDs      []string
	FromMailboxID string
	ToMailboxID   string
	TaskID        string
}

// BulkDeleteParams defines input for BulkDeleteEmailsWorkflow.
type BulkDeleteParams struct {
	Creds    activity.Credentials
	EmailIDs []string
	TaskID   string
}

// BulkMarkReadParams defines input for BulkMarkReadWorkflow.
type BulkMarkReadParams struct {
	Creds    activity.Credentials
	EmailIDs []string
	MarkRead bool
	TaskID   string
}

// ExportMailboxParams defines input for ExportMailboxWorkflow.
type ExportMailboxParams struct {
	Creds     activity.Credentials
	MailboxID string
	Format    string // "mbox" or "eml-zip"
	TaskID    string
}

// ExportMailboxResult is the result of an export workflow.
type ExportMailboxResult struct {
	BlobID    string
	EmailCount int
}

// ImportMailboxParams defines input for ImportMailboxWorkflow.
type ImportMailboxParams struct {
	Creds     activity.Credentials
	MailboxID string
	BlobID    string
	TaskID    string
}

// ImportMailboxResult is the result of an import workflow.
type ImportMailboxResult struct {
	ImportedCount int
}

// BulkMoveEmailsWorkflow moves emails between mailboxes in batches.
func BulkMoveEmailsWorkflow(ctx workflow.Context, params BulkMoveParams) error {
	ctx = workflow.WithActivityOptions(ctx, activityOptions())
	var a *activity.Activities

	total := len(params.EmailIDs)

	for i := 0; i < total; i += BatchSize {
		end := i + BatchSize
		if end > total {
			end = total
		}
		batch := params.EmailIDs[i:end]

		updates := make(map[string]map[string]interface{})
		for _, id := range batch {
			updates[id] = map[string]interface{}{
				fmt.Sprintf("mailboxIds/%s", params.FromMailboxID): nil,
				fmt.Sprintf("mailboxIds/%s", params.ToMailboxID):   true,
			}
		}

		err := workflow.ExecuteActivity(ctx, a.JMAPBatchUpdate, activity.JMAPBatchUpdateParams{
			Creds:   params.Creds,
			Updates: updates,
		}).Get(ctx, nil)
		if err != nil {
			return err
		}

		// Publish progress.
		progress := float64(end) / float64(total)
		err = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "bulk-move",
			Progress: progress,
			Detail:   fmt.Sprintf("Moved %d/%d emails", end, total),
			Status:   "running",
		}).Get(ctx, nil)
		if err != nil {
			// Log but don't fail on progress publish error.
			workflow.GetLogger(ctx).Warn("failed to publish progress", "error", err)
		}
	}

	// Publish completion.
	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "bulk-move",
		Progress: 1.0,
		Detail:   fmt.Sprintf("Moved %d emails", total),
		Status:   "completed",
	}).Get(ctx, nil)

	return nil
}

// BulkDeleteEmailsWorkflow deletes emails in batches.
func BulkDeleteEmailsWorkflow(ctx workflow.Context, params BulkDeleteParams) error {
	ctx = workflow.WithActivityOptions(ctx, activityOptions())
	var a *activity.Activities

	total := len(params.EmailIDs)

	for i := 0; i < total; i += BatchSize {
		end := i + BatchSize
		if end > total {
			end = total
		}
		batch := params.EmailIDs[i:end]

		err := workflow.ExecuteActivity(ctx, a.JMAPBatchDestroy, activity.JMAPBatchDestroyParams{
			Creds:    params.Creds,
			EmailIDs: batch,
		}).Get(ctx, nil)
		if err != nil {
			return err
		}

		progress := float64(end) / float64(total)
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "bulk-delete",
			Progress: progress,
			Detail:   fmt.Sprintf("Deleted %d/%d emails", end, total),
			Status:   "running",
		}).Get(ctx, nil)
	}

	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "bulk-delete",
		Progress: 1.0,
		Detail:   fmt.Sprintf("Deleted %d emails", total),
		Status:   "completed",
	}).Get(ctx, nil)

	return nil
}

// BulkMarkReadWorkflow marks emails as read/unread in batches.
func BulkMarkReadWorkflow(ctx workflow.Context, params BulkMarkReadParams) error {
	ctx = workflow.WithActivityOptions(ctx, activityOptions())
	var a *activity.Activities

	total := len(params.EmailIDs)

	for i := 0; i < total; i += BatchSize {
		end := i + BatchSize
		if end > total {
			end = total
		}
		batch := params.EmailIDs[i:end]

		updates := make(map[string]map[string]interface{})
		for _, id := range batch {
			updates[id] = map[string]interface{}{
				"keywords/$seen": params.MarkRead,
			}
		}

		err := workflow.ExecuteActivity(ctx, a.JMAPBatchUpdate, activity.JMAPBatchUpdateParams{
			Creds:   params.Creds,
			Updates: updates,
		}).Get(ctx, nil)
		if err != nil {
			return err
		}

		progress := float64(end) / float64(total)
		action := "read"
		if !params.MarkRead {
			action = "unread"
		}
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "bulk-mark-read",
			Progress: progress,
			Detail:   fmt.Sprintf("Marked %d/%d emails as %s", end, total, action),
			Status:   "running",
		}).Get(ctx, nil)
	}

	action := "read"
	if !params.MarkRead {
		action = "unread"
	}
	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "bulk-mark-read",
		Progress: 1.0,
		Detail:   fmt.Sprintf("Marked %d emails as %s", total, action),
		Status:   "completed",
	}).Get(ctx, nil)

	return nil
}

// ExportMailboxWorkflow exports all emails in a mailbox.
func ExportMailboxWorkflow(ctx workflow.Context, params ExportMailboxParams) (*ExportMailboxResult, error) {
	ctx = workflow.WithActivityOptions(ctx, activityOptions())
	var a *activity.Activities

	// Step 1: Fetch all email IDs in the mailbox.
	var emailIDs []string
	err := workflow.ExecuteActivity(ctx, a.JMAPFetchEmailIds, activity.FetchIdsParams{
		Creds:     params.Creds,
		MailboxID: params.MailboxID,
	}).Get(ctx, &emailIDs)
	if err != nil {
		return nil, fmt.Errorf("fetching email IDs: %w", err)
	}

	total := len(emailIDs)
	if total == 0 {
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "export-mailbox",
			Progress: 1.0,
			Detail:   "Mailbox is empty",
			Status:   "completed",
		}).Get(ctx, nil)
		return &ExportMailboxResult{EmailCount: 0}, nil
	}

	// Step 2: Fetch blobs in batches and collect data.
	var allBlobs []activity.EmailBlob
	for i := 0; i < total; i += BatchSize {
		end := i + BatchSize
		if end > total {
			end = total
		}
		batch := emailIDs[i:end]

		var blobs []activity.EmailBlob
		err := workflow.ExecuteActivity(ctx, a.JMAPFetchEmailBlobs, activity.FetchBlobsParams{
			Creds:    params.Creds,
			EmailIDs: batch,
		}).Get(ctx, &blobs)
		if err != nil {
			return nil, fmt.Errorf("fetching blobs batch %d: %w", i/BatchSize, err)
		}

		allBlobs = append(allBlobs, blobs...)

		progress := float64(end) / float64(total)
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "export-mailbox",
			Progress: progress * 0.9, // Reserve 10% for upload.
			Detail:   fmt.Sprintf("Downloaded %d/%d emails", end, total),
			Status:   "running",
		}).Get(ctx, nil)
	}

	// Step 3: Build mbox format and upload.
	var mboxData []byte
	for _, blob := range allBlobs {
		// mbox format: "From " line + email data + blank line.
		mboxData = append(mboxData, []byte(fmt.Sprintf("From - %s\n", time.Now().Format(time.ANSIC)))...)
		mboxData = append(mboxData, blob.Data...)
		mboxData = append(mboxData, '\n', '\n')
	}

	// Upload the mbox as a blob via JMAP upload.
	// We use a dedicated activity for this to keep workflow deterministic.
	var uploadResult struct{ BlobID string }
	err = workflow.ExecuteActivity(ctx, a.UploadBlob, uploadBlobParams{
		Creds:       params.Creds,
		Data:        mboxData,
		ContentType: "application/mbox",
	}).Get(ctx, &uploadResult)
	if err != nil {
		return nil, fmt.Errorf("uploading mbox: %w", err)
	}

	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "export-mailbox",
		Progress: 1.0,
		Detail:   fmt.Sprintf("Exported %d emails\nblobId:%s", total, uploadResult.BlobID),
		Status:   "completed",
	}).Get(ctx, nil)

	return &ExportMailboxResult{
		BlobID:     uploadResult.BlobID,
		EmailCount: total,
	}, nil
}

// ImportMailboxWorkflow imports emails from an uploaded mbox file.
func ImportMailboxWorkflow(ctx workflow.Context, params ImportMailboxParams) (*ImportMailboxResult, error) {
	ctx = workflow.WithActivityOptions(ctx, activityOptions())
	var a *activity.Activities

	// Step 1: Download the uploaded blob.
	var blobData []byte
	err := workflow.ExecuteActivity(ctx, a.DownloadBlob, downloadBlobParams{
		Creds:  params.Creds,
		BlobID: params.BlobID,
	}).Get(ctx, &blobData)
	if err != nil {
		return nil, fmt.Errorf("downloading blob: %w", err)
	}

	// Step 2: Parse mbox into individual messages.
	var messages [][]byte
	err = workflow.ExecuteActivity(ctx, a.ParseMbox, blobData).Get(ctx, &messages)
	if err != nil {
		return nil, fmt.Errorf("parsing mbox: %w", err)
	}

	total := len(messages)
	if total == 0 {
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "import-mailbox",
			Progress: 1.0,
			Detail:   "No messages found in file",
			Status:   "completed",
		}).Get(ctx, nil)
		return &ImportMailboxResult{ImportedCount: 0}, nil
	}

	// Step 3: Import in batches of 10.
	importBatchSize := 10
	imported := 0
	for i := 0; i < total; i += importBatchSize {
		end := i + importBatchSize
		if end > total {
			end = total
		}
		batch := messages[i:end]

		err := workflow.ExecuteActivity(ctx, a.JMAPCreateEmails, activity.CreateEmailsParams{
			Creds:     params.Creds,
			MailboxID: params.MailboxID,
			Messages:  batch,
		}).Get(ctx, nil)
		if err != nil {
			return nil, fmt.Errorf("importing batch %d: %w", i/importBatchSize, err)
		}

		imported += len(batch)
		progress := float64(imported) / float64(total)
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "import-mailbox",
			Progress: progress,
			Detail:   fmt.Sprintf("Imported %d/%d emails", imported, total),
			Status:   "running",
		}).Get(ctx, nil)
	}

	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "import-mailbox",
		Progress: 1.0,
		Detail:   fmt.Sprintf("Imported %d emails", imported),
		Status:   "completed",
	}).Get(ctx, nil)

	return &ImportMailboxResult{ImportedCount: imported}, nil
}

// ScheduledSendParams defines input for ScheduledSendWorkflow.
type ScheduledSendParams struct {
	Creds         activity.Credentials
	EmailID       string
	IdentityID    string
	ScheduledTime time.Time
	TaskID        string
}

// ScheduledSendWorkflow sets $scheduled keyword, sleeps until the scheduled time, then sends the email.
func ScheduledSendWorkflow(ctx workflow.Context, params ScheduledSendParams) error {
	var a *activity.Activities
	ctx = workflow.WithActivityOptions(ctx, activityOptions())

	// Set $scheduled keyword on the email so it appears in the Scheduled virtual folder.
	err := workflow.ExecuteActivity(ctx, a.JMAPBatchUpdate, activity.JMAPBatchUpdateParams{
		Creds: params.Creds,
		Updates: map[string]map[string]interface{}{
			params.EmailID: {
				"keywords/$scheduled": true,
			},
		},
	}).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("setting scheduled keyword: %w", err)
	}

	// Publish initial progress.
	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "schedule-send",
		Progress: 0.1,
		Detail:   fmt.Sprintf("Email scheduled for %s", params.ScheduledTime.Format(time.RFC3339)),
		Status:   "running",
	}).Get(ctx, nil)

	// Sleep until scheduled time.
	sleepDuration := params.ScheduledTime.Sub(workflow.Now(ctx))
	if sleepDuration > 0 {
		if err := workflow.Sleep(ctx, sleepDuration); err != nil {
			return err
		}
	}

	// Send the email via JMAP EmailSubmission/set.
	err = workflow.ExecuteActivity(ctx, a.JMAPSendEmail, activity.JMAPSendEmailParams{
		Creds:      params.Creds,
		EmailID:    params.EmailID,
		IdentityID: params.IdentityID,
	}).Get(ctx, nil)
	if err != nil {
		// Remove $scheduled keyword on failure so the draft is accessible again.
		_ = workflow.ExecuteActivity(ctx, a.JMAPBatchUpdate, activity.JMAPBatchUpdateParams{
			Creds: params.Creds,
			Updates: map[string]map[string]interface{}{
				params.EmailID: {
					"keywords/$scheduled": nil,
				},
			},
		}).Get(ctx, nil)
		// Publish failure.
		_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
			Email:    params.Creds.Email,
			TaskID:   params.TaskID,
			TaskType: "schedule-send",
			Progress: 1.0,
			Detail:   fmt.Sprintf("Failed to send scheduled email: %v", err),
			Status:   "failed",
		}).Get(ctx, nil)
		return err
	}

	// Publish completion.
	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "schedule-send",
		Progress: 1.0,
		Detail:   "Scheduled email sent",
		Status:   "completed",
	}).Get(ctx, nil)

	return nil
}

// SnoozeParams defines input for SnoozeEmailWorkflow.
type SnoozeParams struct {
	Creds     activity.Credentials
	EmailID   string
	MailboxID string
	UntilTime time.Time
	TaskID    string
}

// SnoozeEmailWorkflow sets the $snoozed keyword, sleeps, then removes it and marks unread.
func SnoozeEmailWorkflow(ctx workflow.Context, params SnoozeParams) error {
	ctx = workflow.WithActivityOptions(ctx, activityOptions())
	var a *activity.Activities

	// Set $snoozed keyword on the email.
	updates := map[string]map[string]interface{}{
		params.EmailID: {
			"keywords/$snoozed": true,
		},
	}
	err := workflow.ExecuteActivity(ctx, a.JMAPBatchUpdate, activity.JMAPBatchUpdateParams{
		Creds:   params.Creds,
		Updates: updates,
	}).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("setting snoozed keyword: %w", err)
	}

	// Publish progress.
	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "snooze",
		Progress: 0.5,
		Detail:   fmt.Sprintf("Snoozed until %s", params.UntilTime.Format(time.RFC3339)),
		Status:   "running",
	}).Get(ctx, nil)

	// Sleep until snooze time.
	sleepDuration := params.UntilTime.Sub(workflow.Now(ctx))
	if sleepDuration > 0 {
		if err := workflow.Sleep(ctx, sleepDuration); err != nil {
			return err
		}
	}

	// Remove $snoozed keyword and mark as unread.
	wakeUpdates := map[string]map[string]interface{}{
		params.EmailID: {
			"keywords/$snoozed": nil,
			"keywords/$seen":    false,
		},
	}
	err = workflow.ExecuteActivity(ctx, a.JMAPBatchUpdate, activity.JMAPBatchUpdateParams{
		Creds:   params.Creds,
		Updates: wakeUpdates,
	}).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("removing snoozed keyword: %w", err)
	}

	// Publish completion.
	_ = workflow.ExecuteActivity(ctx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "snooze",
		Progress: 1.0,
		Detail:   "Snooze ended, email marked unread",
		Status:   "completed",
	}).Get(ctx, nil)

	return nil
}

// uploadBlobParams for the UploadBlob activity.
type uploadBlobParams struct {
	Creds       activity.Credentials
	Data        []byte
	ContentType string
}

// downloadBlobParams for the DownloadBlob activity.
type downloadBlobParams struct {
	Creds  activity.Credentials
	BlobID string
}
