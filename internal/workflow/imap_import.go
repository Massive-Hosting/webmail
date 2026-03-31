package workflow

import (
	"encoding/json"
	"fmt"
	"time"

	"webmail/internal/activity"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// IMAPImportParams defines input for IMAPImportWorkflow.
type IMAPImportParams struct {
	Creds  activity.Credentials
	IMAP   activity.IMAPConnParams
	JobID  string
	TaskID string
	// Folders to import: [{sourceFolder, targetMailboxId, totalMessages}]
	Folders []IMAPImportFolder
}

// IMAPImportFolder defines a single folder to import.
type IMAPImportFolder struct {
	SourceFolder    string `json:"sourceFolder"`
	TargetMailboxID string `json:"targetMailboxId"`
	TotalMessages   int    `json:"totalMessages"`
}

// FolderProgress tracks per-folder import progress.
type FolderProgress struct {
	SourceFolder    string `json:"sourceFolder"`
	TargetMailboxID string `json:"targetMailboxId"`
	TotalMessages   int    `json:"totalMessages"`
	ImportedCount   int    `json:"importedCount"`
	SkippedCount    int    `json:"skippedCount"`
	FailedCount     int    `json:"failedCount"`
}

const imapFetchBatchSize = 25
const imapImportSubBatch = 10

// imapActivityOptions returns activity options tuned for IMAP operations.
func imapActivityOptions(timeout time.Duration) workflow.ActivityOptions {
	return workflow.ActivityOptions{
		StartToCloseTimeout: timeout,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumAttempts:    3,
			MaximumInterval:    30 * time.Second,
		},
	}
}

// IMAPImportWorkflow imports emails from an external IMAP server.
func IMAPImportWorkflow(ctx workflow.Context, params IMAPImportParams) error {
	var a *activity.Activities

	// Compute total messages across all folders.
	totalMessages := 0
	for _, f := range params.Folders {
		totalMessages += f.TotalMessages
	}

	// Initialize folder progress tracking.
	folderProgress := make([]FolderProgress, len(params.Folders))
	for i, f := range params.Folders {
		folderProgress[i] = FolderProgress{
			SourceFolder:    f.SourceFolder,
			TargetMailboxID: f.TargetMailboxID,
			TotalMessages:   f.TotalMessages,
		}
	}

	globalImported := 0
	globalSkipped := 0
	globalFailed := 0

	// Process each folder sequentially.
	for i, folder := range params.Folders {
		if folder.TotalMessages == 0 {
			continue
		}

		var lastUID uint32

		for {
			// Fetch a batch of messages from IMAP.
			fetchCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(120*time.Second))
			var batchResult activity.IMAPFetchBatchResult
			err := workflow.ExecuteActivity(fetchCtx, a.IMAPFetchBatch, activity.IMAPFetchBatchParams{
				Host:              params.IMAP.Host,
				Port:              params.IMAP.Port,
				Username:          params.IMAP.Username,
				EncryptedPassword: params.IMAP.EncryptedPassword,
				SSL:               params.IMAP.SSL,
				Folder:            folder.SourceFolder,
				LastUID:           lastUID,
				BatchSize:         imapFetchBatchSize,
			}).Get(ctx, &batchResult)
			if err != nil {
				// Record error but continue with next folder.
				workflow.GetLogger(ctx).Error("IMAP fetch failed", "folder", folder.SourceFolder, "error", err)
				errDetail := fmt.Sprintf("IMAP fetch failed: %v", err)
				recordFailureCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(10*time.Second))
				_ = workflow.ExecuteActivity(recordFailureCtx, a.RecordIMAPImportFailure, activity.RecordIMAPImportFailureParams{
					JobID:  params.JobID,
					Folder: folder.SourceFolder,
					Reason: "import_error",
					Detail: &errDetail,
				}).Get(ctx, nil)
				break
			}

			if len(batchResult.Messages) == 0 {
				break
			}

			// Check for duplicates via Message-ID.
			var messageIDs []string
			msgIDMap := make(map[string]bool)
			for _, msg := range batchResult.Messages {
				if msg.MessageID != "" {
					messageIDs = append(messageIDs, msg.MessageID)
					msgIDMap[msg.MessageID] = false
				}
			}

			if len(messageIDs) > 0 {
				dedupCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(30*time.Second))
				var duplicates []string
				err := workflow.ExecuteActivity(dedupCtx, a.CheckDuplicateMessageIDs, activity.CheckDuplicateMessageIDsParams{
					Creds:      params.Creds,
					MessageIDs: messageIDs,
				}).Get(ctx, &duplicates)
				if err == nil {
					for _, dup := range duplicates {
						msgIDMap[dup] = true
					}
				}
			}

			// Separate new messages from duplicates.
			var newMessages [][]byte
			for _, msg := range batchResult.Messages {
				isDup := msgIDMap[msg.MessageID]
				if isDup {
					globalSkipped++
					folderProgress[i].SkippedCount++
					// Record duplicate.
					uid := int64(msg.UID)
					recordCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(10*time.Second))
					_ = workflow.ExecuteActivity(recordCtx, a.RecordIMAPImportFailure, activity.RecordIMAPImportFailureParams{
						JobID:      params.JobID,
						Folder:     folder.SourceFolder,
						MessageUID: &uid,
						MessageID:  &msg.MessageID,
						Reason:     "duplicate",
					}).Get(ctx, nil)
				} else {
					newMessages = append(newMessages, msg.Data)
				}
			}

			// Import new messages via JMAP in sub-batches of 10.
			for j := 0; j < len(newMessages); j += imapImportSubBatch {
				end := j + imapImportSubBatch
				if end > len(newMessages) {
					end = len(newMessages)
				}
				subBatch := newMessages[j:end]

				importCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(60*time.Second))
				err := workflow.ExecuteActivity(importCtx, a.JMAPCreateEmails, activity.CreateEmailsParams{
					Creds:     params.Creds,
					MailboxID: folder.TargetMailboxID,
					Messages:  subBatch,
				}).Get(ctx, nil)
				if err != nil {
					// Record failures for this sub-batch.
					globalFailed += len(subBatch)
					folderProgress[i].FailedCount += len(subBatch)
					errDetail := fmt.Sprintf("JMAP import failed: %v", err)
					recordCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(10*time.Second))
					_ = workflow.ExecuteActivity(recordCtx, a.RecordIMAPImportFailure, activity.RecordIMAPImportFailureParams{
						JobID:  params.JobID,
						Folder: folder.SourceFolder,
						Reason: "import_error",
						Detail: &errDetail,
					}).Get(ctx, nil)
				} else {
					globalImported += len(subBatch)
					folderProgress[i].ImportedCount += len(subBatch)
				}
			}

			// Update progress.
			processedSoFar := globalImported + globalSkipped + globalFailed
			progress := float64(0)
			if totalMessages > 0 {
				progress = float64(processedSoFar) / float64(totalMessages)
				if progress > 1.0 {
					progress = 1.0
				}
			}

			folderConfigJSON, _ := json.Marshal(folderProgress)
			progressCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(10*time.Second))
			_ = workflow.ExecuteActivity(progressCtx, a.UpdateIMAPImportProgress, activity.UpdateIMAPImportProgressParams{
				JobID:         params.JobID,
				TotalMessages: totalMessages,
				Imported:      globalImported,
				Skipped:       globalSkipped,
				Failed:        globalFailed,
				FolderConfig:  folderConfigJSON,
				Email:         params.Creds.Email,
				TaskID:        params.TaskID,
				Progress:      progress,
				Detail:        fmt.Sprintf("Importing %s: %d/%d", folder.SourceFolder, processedSoFar, totalMessages),
			}).Get(ctx, nil)

			lastUID = batchResult.LastUID
			if !batchResult.HasMore {
				break
			}
		}
	}

	// Complete the job.
	completeStatus := "completed"
	var errorMessage *string
	if globalFailed > 0 && globalImported == 0 {
		completeStatus = "failed"
		msg := fmt.Sprintf("All %d messages failed to import", globalFailed)
		errorMessage = &msg
	} else if globalFailed > 0 {
		completeStatus = "completed"
		msg := fmt.Sprintf("%d messages failed to import", globalFailed)
		errorMessage = &msg
	}

	// Final DB update.
	folderConfigJSON, _ := json.Marshal(folderProgress)
	progressCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(10*time.Second))
	_ = workflow.ExecuteActivity(progressCtx, a.UpdateIMAPImportProgress, activity.UpdateIMAPImportProgressParams{
		JobID:         params.JobID,
		TotalMessages: totalMessages,
		Imported:      globalImported,
		Skipped:       globalSkipped,
		Failed:        globalFailed,
		FolderConfig:  folderConfigJSON,
		Email:         params.Creds.Email,
		TaskID:        params.TaskID,
		Progress:      1.0,
		Detail:        fmt.Sprintf("Import complete: %d imported, %d skipped, %d failed", globalImported, globalSkipped, globalFailed),
	}).Get(ctx, nil)

	// Mark job as complete in DB (via inline activity execution for simplicity).
	completeCtx := workflow.WithActivityOptions(ctx, imapActivityOptions(10*time.Second))
	_ = workflow.ExecuteActivity(completeCtx, a.CompleteIMAPImportJob, activity.CompleteIMAPImportJobParams{
		JobID:        params.JobID,
		Status:       completeStatus,
		ErrorMessage: errorMessage,
	}).Get(ctx, nil)

	// Publish final progress.
	_ = workflow.ExecuteActivity(progressCtx, a.PublishProgress, activity.ProgressParams{
		Email:    params.Creds.Email,
		TaskID:   params.TaskID,
		TaskType: "imap-import",
		Progress: 1.0,
		Detail:   fmt.Sprintf("Import complete: %d imported, %d skipped, %d failed", globalImported, globalSkipped, globalFailed),
		Status:   completeStatus,
	}).Get(ctx, nil)

	return nil
}
