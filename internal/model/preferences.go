package model

import (
	"encoding/json"
	"time"
)

// UserPreferences stores user-level settings and cached Stalwart context.
type UserPreferences struct {
	Email         string          `json:"email"`
	Preferences   json.RawMessage `json:"preferences"`
	PGPPublicKey  *string         `json:"pgp_public_key,omitempty"`
	StalwartURL   *string         `json:"-"`
	StalwartToken *string         `json:"-"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// StalwartContext holds cached Stalwart connection details for an email account.
type StalwartContext struct {
	StalwartURL      string `json:"stalwart_url"`
	StalwartToken    string `json:"stalwart_token"`
	FQDN             string `json:"fqdn,omitempty"`
	FreeBusyEnabled  bool   `json:"freebusy_enabled"`
	DirectoryEnabled bool   `json:"directory_enabled"`
}
