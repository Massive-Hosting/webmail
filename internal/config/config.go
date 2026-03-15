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
		RateLimitPerMinute: envIntOr("WEBMAIL_RATE_LIMIT", 120),
		ValkeyURL:          envOr("VALKEY_URL", "redis://127.0.0.1:6379/0"),
		TemporalAddress:    envOr("TEMPORAL_ADDRESS", "localhost:7233"),
	}

	// Parse allowed origins.
	if origins := os.Getenv("WEBMAIL_ALLOWED_ORIGINS"); origins != "" {
		cfg.AllowedOrigins = strings.Split(origins, ",")
		for i := range cfg.AllowedOrigins {
			cfg.AllowedOrigins[i] = strings.TrimSpace(cfg.AllowedOrigins[i])
		}
	}

	// Parse secret encryption key (hex-encoded 32 bytes) — optional,
	// no longer required for sessions (now backed by Valkey).
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
	if cfg.CoreAPIURL == "" {
		return nil, errors.New("WEBMAIL_CORE_API_URL is required")
	}
	if cfg.CoreAPIKey == "" {
		return nil, errors.New("WEBMAIL_API_KEY is required")
	}

	return cfg, nil
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

func envInt64Or(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}
