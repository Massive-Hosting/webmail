-- +goose Up
-- Fix: event IDs are account-scoped in Stalwart (short IDs like "b", "c"),
-- so the PK must include owner_email to avoid collisions across accounts.
ALTER TABLE event_participants DROP CONSTRAINT event_participants_pkey;
ALTER TABLE event_participants ADD PRIMARY KEY (event_id, email, owner_email);

-- +goose Down
ALTER TABLE event_participants DROP CONSTRAINT event_participants_pkey;
ALTER TABLE event_participants ADD PRIMARY KEY (event_id, email);
