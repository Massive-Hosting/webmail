-- +goose Up
CREATE TABLE app_passwords (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_passwords_email ON app_passwords(email);

-- +goose Down
DROP TABLE IF EXISTS app_passwords;
