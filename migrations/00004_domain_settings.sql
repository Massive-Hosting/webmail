-- +goose Up
CREATE TABLE domain_settings (
    domain TEXT PRIMARY KEY,
    freebusy_enabled BOOLEAN NOT NULL DEFAULT false,
    directory_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS domain_settings;
