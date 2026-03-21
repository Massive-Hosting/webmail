-- +goose Up
CREATE TABLE event_participants (
    event_id TEXT NOT NULL,
    email TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'attendee',
    status TEXT NOT NULL DEFAULT 'needs-action',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, email)
);

CREATE INDEX idx_event_participants_owner ON event_participants(owner_email);

-- +goose Down
DROP TABLE IF EXISTS event_participants;
