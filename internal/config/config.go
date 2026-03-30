package config

import (
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"strings"
)

// Config holds all webmail configuration loaded from environment variables.
type Config struct {
	ListenAddr         string
	DatabaseURL        string
	CoreAPIURL         string
	CoreAPIKey         string
	SecretEncryptionKey []byte // 32 bytes for AES-256
	SessionMaxAge      int    // seconds
	MaxUploadSize      int64  // bytes
	RateLimitPerMinute int
	AllowedOrigins     []string
	ValkeyURL          string
	TemporalAddress    string

	// AI assistant configuration.
	AIEnabled   bool
	AIBaseURL   string
	AIAPIKey    string
	AIModel     string
	AIMaxTokens int

	// TURN server for WebRTC NAT traversal.
	TURNSecret  string
	TURNServers string // Comma-separated TURN URIs

	// Standalone mode: connect directly to Stalwart without the hosting platform.
	// Set STALWART_URL and STALWART_ADMIN_TOKEN to enable.
	StalwartURL        string
	StalwartAdminToken string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		ListenAddr:         envOr("WEBMAIL_LISTEN_ADDR", ":8095"),
		DatabaseURL:        os.Getenv("WEBMAIL_DATABASE_URL"),
		CoreAPIURL:         os.Getenv("WEBMAIL_CORE_API_URL"),
		CoreAPIKey:         os.Getenv("WEBMAIL_API_KEY"),
		SessionMaxAge:      envIntOr("WEBMAIL_SESSION_MAX_AGE", 86400),
		MaxUploadSize:      envInt64Or("WEBMAIL_MAX_UPLOAD_SIZE", 25*1024*1024),
		RateLimitPerMinute: envIntOr("WEBMAIL_RATE_LIMIT", 600),
		ValkeyURL:          envOr("VALKEY_URL", "redis://127.0.0.1:6379/0"),
		TemporalAddress:    envOr("TEMPORAL_ADDRESS", "localhost:7233"),
		AIEnabled:          envBoolOr("AI_ENABLED", false),
		AIBaseURL:          os.Getenv("AI_BASE_URL"),
		AIAPIKey:           os.Getenv("AI_API_KEY"),
		AIModel:            os.Getenv("AI_MODEL"),
		AIMaxTokens:        envIntOr("AI_MAX_TOKENS", 1024),
		TURNSecret:         os.Getenv("TURN_SECRET"),
		TURNServers:        os.Getenv("TURN_SERVERS"),
		StalwartURL:        os.Getenv("STALWART_URL"),
		StalwartAdminToken: os.Getenv("STALWART_ADMIN_TOKEN"),
	}

	// Parse allowed origins.
	if origins := os.Getenv("WEBMAIL_ALLOWED_ORIGINS"); origins != "" {
		cfg.AllowedOrigins = strings.Split(origins, ",")
		for i := range cfg.AllowedOrigins {
			cfg.AllowedOrigins[i] = strings.TrimSpace(cfg.AllowedOrigins[i])
		}
	}

	// Parse secret encryption key (hex-encoded 32 bytes) — required for
	// encrypting credentials stored in Temporal workflow state.
	if keyHex := os.Getenv("SECRET_ENCRYPTION_KEY"); keyHex != "" {
		key, err := hex.DecodeString(keyHex)
		if err != nil {
			return nil, errors.New("SECRET_ENCRYPTION_KEY must be valid hex")
		}
		if len(key) != 32 {
			return nil, errors.New("SECRET_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)")
		}
		cfg.SecretEncryptionKey = key
	}

	// Validate required fields.
	if cfg.StalwartURL != "" && cfg.StalwartAdminToken != "" {
		// Standalone mode: direct Stalwart connection, no hosting platform needed.
		// CoreAPIURL and CoreAPIKey are optional.
	} else {
		if cfg.CoreAPIURL == "" {
			return nil, errors.New("WEBMAIL_CORE_API_URL is required (or set STALWART_URL + STALWART_ADMIN_TOKEN for standalone mode)")
		}
		if cfg.CoreAPIKey == "" {
			return nil, errors.New("WEBMAIL_API_KEY is required (or set STALWART_URL + STALWART_ADMIN_TOKEN for standalone mode)")
		}
	}
	if len(cfg.SecretEncryptionKey) == 0 {
		return nil, errors.New("SECRET_ENCRYPTION_KEY is required")
	}

	return cfg, nil
}

// IsStandalone returns true when running in standalone mode (direct Stalwart, no hosting platform).
func (c *Config) IsStandalone() bool {
	return c.StalwartURL != "" && c.StalwartAdminToken != ""
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBoolOr(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		return v == "true" || v == "1" || v == "yes"
	}
	return fallback
}

func envInt64Or(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}
