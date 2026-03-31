-- +goose Up
CREATE TABLE imap_import_jobs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    imap_host TEXT NOT NULL,
    imap_port INT NOT NULL DEFAULT 993,
    imap_user TEXT NOT NULL,
    imap_ssl BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'running',
    folder_config JSONB NOT NULL DEFAULT '[]',
    total_messages INT NOT NULL DEFAULT 0,
    imported_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_imap_import_jobs_email ON imap_import_jobs(email);

CREATE TABLE imap_import_failures (
    id BIGSERIAL PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES imap_import_jobs(id) ON DELETE CASCADE,
    folder TEXT NOT NULL,
    message_uid BIGINT,
    message_id TEXT,
    reason TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_imap_import_failures_job ON imap_import_failures(job_id);

-- +goose Down
DROP TABLE IF EXISTS imap_import_failures;
DROP TABLE IF EXISTS imap_import_jobs;
