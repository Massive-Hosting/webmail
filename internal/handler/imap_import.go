package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"webmail/internal/activity"
	"webmail/internal/credcrypt"
	"webmail/internal/db"
	"webmail/internal/middleware"
	"webmail/internal/worker"
	"webmail/internal/workflow"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"go.temporal.io/sdk/client"
)

// ImportHandler handles IMAP import API endpoints.
type ImportHandler struct {
	temporal      client.Client
	encryptionKey []byte
	pool          *pgxpool.Pool
	queries       *db.Queries
	acts          *activity.Activities
	log           zerolog.Logger
}

// NewImportHandler creates a new import handler.
func NewImportHandler(temporal client.Client, encryptionKey []byte, pool *pgxpool.Pool, rdb interface{}, log zerolog.Logger) *ImportHandler {
	return &ImportHandler{
		temporal:      temporal,
		encryptionKey: encryptionKey,
		pool:          pool,
		queries:       db.NewQueries(pool),
		acts:          activity.NewActivities(pool, nil, log, encryptionKey),
		log:           log.With().Str("component", "import-handler").Logger(),
	}
}

// TestConnection handles POST /api/import/test-connection.
func (h *ImportHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Username string `json:"username"`
		Password string `json:"password"`
		SSL      bool   `json:"ssl"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.Host == "" || req.Username == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}
	if req.Port == 0 {
		req.Port = 993
	}

	// Encrypt password for activity.
	encryptedPw, err := credcrypt.Encrypt(h.encryptionKey, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"encryption_failed"})
		return
	}

	// Direct activity call (no Temporal workflow needed).
	result, err := h.acts.IMAPTestConnection(r.Context(), activity.IMAPTestConnectionParams{
		Host:              req.Host,
		Port:              req.Port,
		Username:          req.Username,
		EncryptedPassword: encryptedPw,
		SSL:               req.SSL,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"connection_test_failed"})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// ListFolders handles POST /api/import/list-folders.
func (h *ImportHandler) ListFolders(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Username string `json:"username"`
		Password string `json:"password"`
		SSL      bool   `json:"ssl"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.Host == "" || req.Username == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}
	if req.Port == 0 {
		req.Port = 993
	}

	encryptedPw, err := credcrypt.Encrypt(h.encryptionKey, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"encryption_failed"})
		return
	}

	folders, err := h.acts.IMAPListFolders(r.Context(), activity.IMAPListFoldersParams{
		Host:              req.Host,
		Port:              req.Port,
		Username:          req.Username,
		EncryptedPassword: encryptedPw,
		SSL:               req.SSL,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to list IMAP folders")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"list_folders_failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"folders": folders})
}

// StartImport handles POST /api/import/start.
func (h *ImportHandler) StartImport(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	var req struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Username string `json:"username"`
		Password string `json:"password"`
		SSL      bool   `json:"ssl"`
		Folders  []struct {
			SourceFolder    string `json:"sourceFolder"`
			TargetMailboxID string `json:"targetMailboxId"`
			TotalMessages   int    `json:"totalMessages"`
		} `json:"folders"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1*1024*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	if req.Host == "" || req.Username == "" || req.Password == "" || len(req.Folders) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_fields"})
		return
	}
	if req.Port == 0 {
		req.Port = 993
	}

	// Encrypt IMAP password.
	imapEncryptedPw, err := credcrypt.Encrypt(h.encryptionKey, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"encryption_failed"})
		return
	}

	// Encrypt Stalwart password for JMAP activities.
	stalwartEncryptedPw, err := credcrypt.Encrypt(h.encryptionKey, sess.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"encryption_failed"})
		return
	}

	// Generate job and task IDs.
	taskHandler := &TaskHandler{encryptionKey: h.encryptionKey}
	taskID := taskHandler.generateTaskID("imap-import", sess.Email)
	jobID := taskID

	// Compute total messages.
	totalMessages := 0
	var folders []workflow.IMAPImportFolder
	var folderConfigs []map[string]interface{}
	for _, f := range req.Folders {
		totalMessages += f.TotalMessages
		folders = append(folders, workflow.IMAPImportFolder{
			SourceFolder:    f.SourceFolder,
			TargetMailboxID: f.TargetMailboxID,
			TotalMessages:   f.TotalMessages,
		})
		folderConfigs = append(folderConfigs, map[string]interface{}{
			"sourceFolder":    f.SourceFolder,
			"targetMailboxId": f.TargetMailboxID,
			"totalMessages":   f.TotalMessages,
			"importedCount":   0,
			"skippedCount":    0,
			"failedCount":     0,
		})
	}

	// Create job record in DB.
	folderConfigJSON, _ := json.Marshal(folderConfigs)
	err = h.queries.CreateIMAPImportJob(r.Context(), &db.IMAPImportJob{
		ID:            jobID,
		Email:         sess.Email,
		IMAPHost:      req.Host,
		IMAPPort:      req.Port,
		IMAPUser:      req.Username,
		IMAPSSL:       req.SSL,
		Status:        "running",
		FolderConfig:  folderConfigJSON,
		TotalMessages: totalMessages,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create import job")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"job_creation_failed"})
		return
	}

	// Start Temporal workflow.
	_, err = h.temporal.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
		ID:        taskID,
		TaskQueue: worker.TaskQueue,
	}, workflow.IMAPImportWorkflow, workflow.IMAPImportParams{
		Creds: activity.Credentials{
			Email:             sess.Email,
			EncryptedPassword: stalwartEncryptedPw,
			AccountID:         sess.AccountID,
			StalwartURL:       sess.StalwartURL,
		},
		IMAP: activity.IMAPConnParams{
			Host:              req.Host,
			Port:              req.Port,
			Username:          req.Username,
			EncryptedPassword: imapEncryptedPw,
			SSL:               req.SSL,
		},
		JobID:   jobID,
		TaskID:  taskID,
		Folders: folders,
	})
	if err != nil {
		h.log.Error().Err(err).Msg("failed to start import workflow")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"workflow_start_failed"})
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]string{
		"jobId":  jobID,
		"taskId": taskID,
		"status": "running",
	})
}

// ListJobs handles GET /api/import/jobs.
func (h *ImportHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	jobs, err := h.queries.ListIMAPImportJobs(r.Context(), sess.Email)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to list import jobs")
		writeJSON(w, http.StatusInternalServerError, errorResponse{"list_failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"jobs": jobs})
}

// GetJob handles GET /api/import/jobs/{id}.
func (h *ImportHandler) GetJob(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"missing_job_id"})
		return
	}

	job, err := h.queries.GetIMAPImportJob(r.Context(), jobID, sess.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"get_failed"})
		return
	}
	if job == nil {
		writeJSON(w, http.StatusNotFound, errorResponse{"job_not_found"})
		return
	}

	// Also fetch failures.
	failures, err := h.queries.ListIMAPImportFailures(r.Context(), jobID)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to list import failures")
		failures = []db.IMAPImportFailure{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"job":      job,
		"failures": failures,
	})
}

