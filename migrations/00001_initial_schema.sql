-- +goose Up
CREATE TABLE brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE partners (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id),
    name TEXT NOT NULL,
    hostname TEXT NOT NULL UNIQUE,
    primary_color TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partners_hostname ON partners(hostname);
CREATE INDEX idx_partners_brand_id ON partners(brand_id);

CREATE TABLE user_preferences (
    email TEXT PRIMARY KEY,
    preferences JSONB NOT NULL DEFAULT '{}',
    pgp_public_key TEXT,
    stalwart_url TEXT,
    stalwart_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS partners;
DROP TABLE IF EXISTS brands;
