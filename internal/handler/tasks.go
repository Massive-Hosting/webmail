package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"webmail/internal/activity"
	"webmail/internal/credcrypt"
	"webmail/internal/middleware"
	"webmail/internal/worker"
	"webmail/internal/workflow"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
	"go.temporal.io/sdk/client"
)

// TaskHandler handles API endpoints for triggering and querying Temporal workflows.
type TaskHandler struct {
	temporal      client.Client
	encryptionKey []byte
	log           zerolog.Logger
}

// NewTaskHandler creates a new task handler.
func NewTaskHandler(temporal client.Client, encryptionKey []byte, log zerolog.Logger) *TaskHandler {
	return &TaskHandler{
		temporal:      temporal,
		encryptionKey: encryptionKey,
		log:           log.With().Str("component", "task-handler").Logger(),
	}
}

type taskResponse struct {
	TaskID string `json:"taskId"`
	Status string `json:"status"`
}

type taskStatusResponse struct {
	TaskID string `json:"taskId"`
	Status string `json:"status"`
}

func (h *TaskHandler) credsFromSession(r *http.Request) *activity.Credentials {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		return nil
	}
	encryptedPw, err := credcrypt.Encrypt(h.encryptionKey, sess.Password)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to encrypt credentials for workflow")
		return nil
	}
	return &activity.Credentials{
		Email:             sess.Email,
		EncryptedPassword: encryptedPw,
		AccountID:         sess.AccountID,
		StalwartURL:       sess.StalwartURL,
	}
}

func (h *TaskHandler) generateTaskID(taskType, email string) string {
	return fmt.Sprintf("%s-%s-%d", taskType, email, time.Now().UnixMilli())
}

// BulkMove handles POST /api/tasks/bulk-move.
func (h *TaskHandler) BulkMove(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EmailIDs      []string `json:"emailIds"`
		FromMailboxID string   `json:"fromMailboxId"`
		ToMailboxID   string   `json:"toMailboxId"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(req.EmailIDs) == 0 || req.FromMailboxID == "" || req.ToMailboxID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	taskID := h.generateTaskID("bulk-move", creds.Email)

	_, err := h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.BulkMoveEmailsWorkflow, workflow.BulkMoveParams{
		Creds:         *creds,
		EmailIDs:      req.EmailIDs,
		FromMailboxID: req.FromMailboxID,
		ToMailboxID:   req.ToMailboxID,
		TaskID:        taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start bulk-move workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// BulkDelete handles POST /api/tasks/bulk-delete.
func (h *TaskHandler) BulkDelete(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EmailIDs []string `json:"emailIds"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(req.EmailIDs) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	taskID := h.generateTaskID("bulk-delete", creds.Email)

	_, err := h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.BulkDeleteEmailsWorkflow, workflow.BulkDeleteParams{
		Creds:    *creds,
		EmailIDs: req.EmailIDs,
		TaskID:   taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start bulk-delete workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// BulkMarkRead handles POST /api/tasks/bulk-mark-read.
func (h *TaskHandler) BulkMarkRead(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EmailIDs []string `json:"emailIds"`
		MarkRead bool     `json:"markRead"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if len(req.EmailIDs) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	taskID := h.generateTaskID("bulk-mark-read", creds.Email)

	_, err := h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.BulkMarkReadWorkflow, workflow.BulkMarkReadParams{
		Creds:    *creds,
		EmailIDs: req.EmailIDs,
		MarkRead: req.MarkRead,
		TaskID:   taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start bulk-mark-read workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// ExportMailbox handles POST /api/tasks/export-mailbox.
func (h *TaskHandler) ExportMailbox(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		MailboxID string `json:"mailboxId"`
		Format    string `json:"format"` // "mbox" or "eml-zip"
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.MailboxID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}
	if req.Format == "" {
		req.Format = "mbox"
	}

	taskID := h.generateTaskID("export-mailbox", creds.Email)

	_, err := h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.ExportMailboxWorkflow, workflow.ExportMailboxParams{
		Creds:     *creds,
		MailboxID: req.MailboxID,
		Format:    req.Format,
		TaskID:    taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start export-mailbox workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// ImportMailbox handles POST /api/tasks/import-mailbox.
func (h *TaskHandler) ImportMailbox(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		MailboxID string `json:"mailboxId"`
		BlobID    string `json:"blobId"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.MailboxID == "" || req.BlobID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	taskID := h.generateTaskID("import-mailbox", creds.Email)

	_, err := h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.ImportMailboxWorkflow, workflow.ImportMailboxParams{
		Creds:     *creds,
		MailboxID: req.MailboxID,
		BlobID:    req.BlobID,
		TaskID:    taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start import-mailbox workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// ScheduleSend handles POST /api/tasks/schedule-send.
func (h *TaskHandler) ScheduleSend(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EmailID    string `json:"emailId"`
		IdentityID string `json:"identityId"`
		SendAt     string `json:"sendAt"` // RFC 3339
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.EmailID == "" || req.SendAt == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	sendAt, err := time.Parse(time.RFC3339, req.SendAt)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_send_at"})
		return
	}

	taskID := h.generateTaskID("schedule-send", creds.Email)

	_, err = h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.ScheduledSendWorkflow, workflow.ScheduledSendParams{
		Creds:         *creds,
		EmailID:       req.EmailID,
		IdentityID:    req.IdentityID,
		ScheduledTime: sendAt,
		TaskID:        taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start schedule-send workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// Snooze handles POST /api/tasks/snooze.
func (h *TaskHandler) Snooze(w http.ResponseWriter, r *http.Request) {
	creds := h.credsFromSession(r)
	if creds == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		EmailID   string `json:"emailId"`
		MailboxID string `json:"mailboxId"`
		Until     string `json:"until"` // RFC 3339
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.EmailID == "" || req.Until == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}

	until, err := time.Parse(time.RFC3339, req.Until)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_until"})
		return
	}

	taskID := h.generateTaskID("snooze", creds.Email)

	_, err = h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.SnoozeEmailWorkflow, workflow.SnoozeParams{
		Creds:     *creds,
		EmailID:   req.EmailID,
		MailboxID: req.MailboxID,
		UntilTime: until,
		TaskID:    taskID,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start snooze workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, taskResponse{TaskID: taskID, Status: "running"})
}

// GetTaskStatus handles GET /api/tasks/{taskId}.
func (h *TaskHandler) GetTaskStatus(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	taskID := chi.URLParam(r, "taskId")
	if taskID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_task_id"})
		return
	}

	desc, err := h.temporal.DescribeWorkflowExecution(r.Context(), taskID, "")
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResponse{"task_not_found"})
		return
	}

	status := "running"
	if desc.WorkflowExecutionInfo.CloseTime != nil {
		s := desc.WorkflowExecutionInfo.Status.String()
		switch s {
		case "Completed":
			status = "completed"
		case "Failed", "Canceled", "Terminated", "TimedOut":
			status = "failed"
		default:
			status = "running"
		}
	}

	writeJSON(w, http.StatusOK, taskStatusResponse{
		TaskID: taskID,
		Status: status,
	})
}
