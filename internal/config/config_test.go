package config

import (
	"encoding/hex"
	"os"
	"testing"
)

func setEnv(t *testing.T, key, value string) {
	t.Helper()
	old, existed := os.LookupEnv(key)
	os.Setenv(key, value)
	t.Cleanup(func() {
		if existed {
			os.Setenv(key, old)
		} else {
			os.Unsetenv(key)
		}
	})
}

func clearEnv(t *testing.T, key string) {
	t.Helper()
	old, existed := os.LookupEnv(key)
	os.Unsetenv(key)
	t.Cleanup(func() {
		if existed {
			os.Setenv(key, old)
		}
	})
}

func validKey() string {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	return hex.EncodeToString(key)
}

func TestLoadSuccess(t *testing.T) {
	setEnv(t, "SECRET_ENCRYPTION_KEY", validKey())
	setEnv(t, "WEBMAIL_CORE_API_URL", "http://core:8090")
	setEnv(t, "WEBMAIL_API_KEY", "test-api-key")
	setEnv(t, "WEBMAIL_LISTEN_ADDR", ":9090")
	setEnv(t, "WEBMAIL_SESSION_MAX_AGE", "7200")
	setEnv(t, "WEBMAIL_ALLOWED_ORIGINS", "http://localhost:3000, http://localhost:5173")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.ListenAddr != ":9090" {
		t.Errorf("ListenAddr: got %q, want %q", cfg.ListenAddr, ":9090")
	}
	if cfg.CoreAPIURL != "http://core:8090" {
		t.Errorf("CoreAPIURL: got %q, want %q", cfg.CoreAPIURL, "http://core:8090")
	}
	if cfg.CoreAPIKey != "test-api-key" {
		t.Errorf("CoreAPIKey: got %q, want %q", cfg.CoreAPIKey, "test-api-key")
	}
	if cfg.SessionMaxAge != 7200 {
		t.Errorf("SessionMaxAge: got %d, want %d", cfg.SessionMaxAge, 7200)
	}
	if len(cfg.SecretEncryptionKey) != 32 {
		t.Errorf("SecretEncryptionKey length: got %d, want %d", len(cfg.SecretEncryptionKey), 32)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Errorf("AllowedOrigins: got %d items, want 2", len(cfg.AllowedOrigins))
	}
	if cfg.AllowedOrigins[0] != "http://localhost:3000" {
		t.Errorf("AllowedOrigins[0]: got %q, want %q", cfg.AllowedOrigins[0], "http://localhost:3000")
	}
}

func TestLoadDefaults(t *testing.T) {
	setEnv(t, "SECRET_ENCRYPTION_KEY", validKey())
	setEnv(t, "WEBMAIL_CORE_API_URL", "http://core:8090")
	setEnv(t, "WEBMAIL_API_KEY", "test-api-key")
	clearEnv(t, "WEBMAIL_LISTEN_ADDR")
	clearEnv(t, "WEBMAIL_SESSION_MAX_AGE")
	clearEnv(t, "WEBMAIL_MAX_UPLOAD_SIZE")
	clearEnv(t, "WEBMAIL_RATE_LIMIT")
	clearEnv(t, "VALKEY_URL")
	clearEnv(t, "TEMPORAL_ADDRESS")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.ListenAddr != ":8095" {
		t.Errorf("default ListenAddr: got %q, want %q", cfg.ListenAddr, ":8095")
	}
	if cfg.SessionMaxAge != 86400 {
		t.Errorf("default SessionMaxAge: got %d, want %d", cfg.SessionMaxAge, 86400)
	}
	if cfg.MaxUploadSize != 25*1024*1024 {
		t.Errorf("default MaxUploadSize: got %d, want %d", cfg.MaxUploadSize, 25*1024*1024)
	}
	if cfg.RateLimitPerMinute != 120 {
		t.Errorf("default RateLimitPerMinute: got %d, want %d", cfg.RateLimitPerMinute, 120)
	}
	if cfg.ValkeyURL != "redis://127.0.0.1:6379/0" {
		t.Errorf("default ValkeyURL: got %q", cfg.ValkeyURL)
	}
	if cfg.TemporalAddress != "localhost:7233" {
		t.Errorf("default TemporalAddress: got %q", cfg.TemporalAddress)
	}
}

func TestLoadMissingSecretKey(t *testing.T) {
	clearEnv(t, "SECRET_ENCRYPTION_KEY")
	setEnv(t, "WEBMAIL_CORE_API_URL", "http://core:8090")
	setEnv(t, "WEBMAIL_API_KEY", "test-api-key")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing SECRET_ENCRYPTION_KEY")
	}
}

func TestLoadMissingCoreAPIURL(t *testing.T) {
	setEnv(t, "SECRET_ENCRYPTION_KEY", validKey())
	clearEnv(t, "WEBMAIL_CORE_API_URL")
	setEnv(t, "WEBMAIL_API_KEY", "test-api-key")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing WEBMAIL_CORE_API_URL")
	}
}

func TestLoadMissingAPIKey(t *testing.T) {
	setEnv(t, "SECRET_ENCRYPTION_KEY", validKey())
	setEnv(t, "WEBMAIL_CORE_API_URL", "http://core:8090")
	clearEnv(t, "WEBMAIL_API_KEY")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing WEBMAIL_API_KEY")
	}
}

func TestLoadInvalidKeyHex(t *testing.T) {
	setEnv(t, "SECRET_ENCRYPTION_KEY", "not-hex")
	setEnv(t, "WEBMAIL_CORE_API_URL", "http://core:8090")
	setEnv(t, "WEBMAIL_API_KEY", "test-api-key")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for invalid hex key")
	}
}

func TestLoadWrongKeyLength(t *testing.T) {
	setEnv(t, "SECRET_ENCRYPTION_KEY", hex.EncodeToString([]byte("too-short")))
	setEnv(t, "WEBMAIL_CORE_API_URL", "http://core:8090")
	setEnv(t, "WEBMAIL_API_KEY", "test-api-key")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for wrong key length")
	}
}
