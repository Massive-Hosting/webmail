package db

import (
	"context"
	"encoding/json"
	"errors"

	"webmail/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Queries provides database operations for the webmail.
type Queries struct {
	pool *pgxpool.Pool
}

// NewQueries creates a new Queries instance.
func NewQueries(pool *pgxpool.Pool) *Queries {
	return &Queries{pool: pool}
}

// GetPartnerByHostname looks up partner and brand info by hostname.
func (q *Queries) GetPartnerByHostname(ctx context.Context, hostname string) (*model.PartnerInfo, error) {
	var info model.PartnerInfo
	err := q.pool.QueryRow(ctx,
		`SELECT p.name, b.name, b.logo_url, p.primary_color
		 FROM partners p
		 JOIN brands b ON b.id = p.brand_id
		 WHERE p.hostname = $1 AND p.status = 'active'`,
		hostname,
	).Scan(&info.PartnerName, &info.BrandName, &info.LogoURL, &info.PrimaryColor)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// GetStalwartContext retrieves cached Stalwart context for an email address.
func (q *Queries) GetStalwartContext(ctx context.Context, email string) (*model.StalwartContext, error) {
	var sc model.StalwartContext
	var url, token *string
	err := q.pool.QueryRow(ctx,
		`SELECT stalwart_url, stalwart_token FROM user_preferences WHERE email = $1`,
		email,
	).Scan(&url, &token)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if url == nil || token == nil || *url == "" {
		return nil, nil
	}
	sc.StalwartURL = *url
	sc.StalwartToken = *token
	return &sc, nil
}

// UpsertStalwartContext caches Stalwart context for an email address.
func (q *Queries) UpsertStalwartContext(ctx context.Context, email string, sc *model.StalwartContext) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO user_preferences (email, stalwart_url, stalwart_token)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (email) DO UPDATE SET
		   stalwart_url = EXCLUDED.stalwart_url,
		   stalwart_token = EXCLUDED.stalwart_token,
		   updated_at = now()`,
		email, sc.StalwartURL, sc.StalwartToken,
	)
	return err
}

// GetPreferences retrieves user preferences JSON for an email address.
func (q *Queries) GetPreferences(ctx context.Context, email string) (json.RawMessage, error) {
	var prefs json.RawMessage
	err := q.pool.QueryRow(ctx,
		`SELECT preferences FROM user_preferences WHERE email = $1`,
		email,
	).Scan(&prefs)
	if errors.Is(err, pgx.ErrNoRows) {
		return json.RawMessage("{}"), nil
	}
	if err != nil {
		return nil, err
	}
	return prefs, nil
}

// UpsertPreferences stores user preferences JSON.
func (q *Queries) UpsertPreferences(ctx context.Context, email string, prefs json.RawMessage) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO user_preferences (email, preferences)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO UPDATE SET
		   preferences = EXCLUDED.preferences,
		   updated_at = now()`,
		email, prefs,
	)
	return err
}

// GetPGPKey retrieves the PGP public key for an email address.
func (q *Queries) GetPGPKey(ctx context.Context, email string) (*string, error) {
	var key *string
	err := q.pool.QueryRow(ctx,
		`SELECT pgp_public_key FROM user_preferences WHERE email = $1`,
		email,
	).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return key, nil
}

// UpsertPGPKey stores a PGP public key for an email address.
func (q *Queries) UpsertPGPKey(ctx context.Context, email, key string) error {
	_, err := q.pool.Exec(ctx,
		`INSERT INTO user_preferences (email, pgp_public_key)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO UPDATE SET
		   pgp_public_key = EXCLUDED.pgp_public_key,
		   updated_at = now()`,
		email, key,
	)
	return err
}

// DeletePGPKey removes the PGP public key for an email address.
func (q *Queries) DeletePGPKey(ctx context.Context, email string) error {
	_, err := q.pool.Exec(ctx,
		`UPDATE user_preferences SET pgp_public_key = NULL, updated_at = now() WHERE email = $1`,
		email,
	)
	return err
}
