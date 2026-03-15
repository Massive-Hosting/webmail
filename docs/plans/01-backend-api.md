# Phase 1 — Backend API & Authentication

## Goal

Build a stateless Go proxy that authenticates webmail users via Stalwart credentials, maintains encrypted sessions, and forwards JMAP requests to Stalwart with proper tenant isolation and security controls.

## Architecture

```
Browser                    Webmail API (Go)                Stalwart         Core API
  |                            |                              |                  |
  |-- POST /api/auth/login --> |                              |                  |
  |    {email, password}       |                              |                  |
  |                            |-- check webmail DB for cached stalwart context  |
  |                            |   (if miss or stale ↓)       |                  |
  |                            |-- GET /email-accounts/by-email/{email}/stalwart-context →|
  |                            |<-- {stalwartURL, token} -----|------------------|
  |                            |   (cache in webmail DB)      |                  |
  |                            |-- GET /jmap (basic auth) --> |                  |
  |                            |   (validate credentials)     |                  |
  |                            |<-- 200 JMAP Session ---------|                  |
  |<-- Set-Cookie: session ----|                              |                  |
  |                            |                              |                  |
  |-- POST /api/jmap -------> |                              |                  |
  |    Cookie: session         |-- POST /jmap (basic auth) -> |                  |
  |    {JMAP request body}     |   (user's credentials)       |                  |
  |                            |<-- JMAP response ------------|                  |
  |<-- JMAP response ---------|                              |                  |
  |                            |                              |                  |
  |-- GET /api/settings -----> |                              |                  |
  |    Cookie: session         |-- reads from webmail DB -----|                  |
  |<-- preferences JSON ------|                              |                  |
```

The webmail API talks to:
- **Stalwart** — for all JMAP operations (mail, contacts, calendar), authenticated with the user's own credentials
- **Core API** — only for Stalwart context resolution on first login (scoped `WEBMAIL_API_KEY`), cached in webmail DB
- **Webmail DB** — for preferences, PGP keys, brand/partner config (own PostgreSQL database)

### Session Model

Sessions are **encrypted cookies** — no server-side session store, no database. The cookie contains the user's email address and an encrypted copy of their Stalwart password, encrypted with the platform's `SECRET_ENCRYPTION_KEY` (AES-256-GCM). This keeps the backend truly stateless.

Cookie properties:
- `HttpOnly`: true (no JavaScript access)
- `Secure`: true (HTTPS only)
- `SameSite`: Strict
- `Max-Age`: 86400 (24 hours, configurable)
- `Path`: /api

## Tasks

### 1.1 — Configuration

Add webmail-specific config to the existing `internal/config/config.go` or create `internal/webmail/config.go`:

```go
type WebmailConfig struct {
    ListenAddr          string // WEBMAIL_LISTEN_ADDR — default ":8095"
    DatabaseURL         string // WEBMAIL_DATABASE_URL — PostgreSQL connection string for webmail DB
    CoreAPIURL          string // WEBMAIL_CORE_API_URL — e.g. "http://core-api:8090"
    CoreAPIKey          string // WEBMAIL_API_KEY — scoped key for core API (stalwart-context only)
    SecretEncryptionKey string // SECRET_ENCRYPTION_KEY — 32-byte AES-256 key for session cookies
    SessionMaxAge       int    // WEBMAIL_SESSION_MAX_AGE — seconds, default 86400
    MaxUploadSize       int64  // WEBMAIL_MAX_UPLOAD_SIZE — bytes, default 25MB
    RateLimitPerMinute  int    // WEBMAIL_RATE_LIMIT — requests/min/user, default 120
    AllowedOrigins      string // WEBMAIL_ALLOWED_ORIGINS — CORS origins, comma-separated
    ValkeyURL           string // VALKEY_URL — for Temporal progress relay, default "redis://127.0.0.1:6379/0"
    TemporalAddress     string // TEMPORAL_ADDRESS — for bulk operations, default "localhost:7233"
    // NOTE: No StalwartBaseURL here. The Stalwart URL is resolved dynamically per user.
    // First login: fetched from core API, then cached in webmail DB.
    // Subsequent logins: read from webmail DB cache. Re-fetched from core API on connection failure.
}
```

**Acceptance Criteria:**
- [ ] Config loads from environment variables with sensible defaults
- [ ] Validation ensures CoreAPIURL, CoreAPIKey, and SecretEncryptionKey are set
- [ ] Config follows existing `config.Load()` pattern

### 1.2 — Session Encryption

Create `internal/webmail/session/` with AES-256-GCM encryption for session cookies.

The session payload:
```go
type SessionData struct {
    Email         string    `json:"e"`
    Password      string    `json:"p"` // encrypted at rest in cookie
    AccountID     string    `json:"a"` // JMAP account ID (Crockford base32)
    StalwartURL   string    `json:"s"` // resolved Stalwart URL for this user's cluster
    StalwartToken string    `json:"t"` // admin token for this Stalwart instance
    UAHash        string    `json:"u"` // SHA-256 of User-Agent (session binding)
    IssuedAt      time.Time `json:"i"`
    ExpiresAt     time.Time `json:"x"`
}
```

Flow:
1. Marshal SessionData to JSON
2. Encrypt with AES-256-GCM using `SECRET_ENCRYPTION_KEY`
3. Base64url-encode the ciphertext
4. Set as cookie value

Decryption is the reverse. Expired sessions are rejected.

**Acceptance Criteria:**
- [ ] AES-256-GCM encryption with random nonce per session
- [ ] Session data is never logged (zerolog must not capture password fields)
- [ ] Expired sessions return 401
- [ ] Tampered cookies return 401 (GCM authentication tag verification)
- [ ] Session rotation: new cookie issued on each request with refreshed expiry (sliding window)
- [ ] Unit tests for encrypt/decrypt round-trip, expiry, tampering

### 1.3 — Authentication Handlers

`internal/webmail/handler/auth.go`:

**POST /api/auth/login**
1. Parse `{email: string, password: string}` from request body
2. Validate email format (RFC 5322)
3. Attempt JMAP session discovery: `GET {stalwart_url}/jmap` with basic auth `email:password`
4. If Stalwart returns 401 → return 401 `{"error": "invalid_credentials"}`
5. Extract JMAP `accountId` from session response
6. Create encrypted session cookie
7. Return 200 `{"email": "...", "accountId": "...", "displayName": "..."}`

**POST /api/auth/logout**
1. Clear session cookie (set Max-Age: 0)
2. Return 204

**GET /api/auth/session**
1. Validate session cookie
2. Return 200 with current session info (email, accountId) or 401

**Acceptance Criteria:**
- [ ] Login validates credentials against Stalwart before issuing session
- [ ] Failed login returns generic error (no user enumeration)
- [ ] Rate limiting on login endpoint: 10 attempts per email per minute, 30 per IP per minute
- [ ] Login response includes JMAP capabilities from Stalwart session
- [ ] Logout clears cookie and returns 204
- [ ] Session endpoint returns 401 for expired/invalid sessions
- [ ] Password never appears in logs or error messages

### 1.4 — JMAP Proxy Handler

`internal/webmail/handler/proxy.go`:

**POST /api/jmap**

This is the core proxy. It forwards JMAP requests from the authenticated browser session to Stalwart.

1. Validate session cookie (middleware)
2. Read request body (limit: 1MB)
3. Validate JMAP request structure:
   - Must have `using` array and `methodCalls` array
   - Reject disallowed capabilities (e.g., admin-only JMAP extensions)
   - Reject method calls that reference accountIds other than the session's accountId (tenant isolation)
4. Forward to Stalwart's `/jmap` endpoint with the user's basic auth credentials
5. Stream response back to browser

**Allowed JMAP capabilities:**
```
urn:ietf:params:jmap:core
urn:ietf:params:jmap:mail
urn:ietf:params:jmap:submission
urn:ietf:params:jmap:vacationresponse
urn:ietf:params:jmap:contacts
urn:ietf:params:jmap:calendars
urn:ietf:params:jmap:blob
```

**Allowed (for user filter management):**
```
urn:ietf:params:jmap:sieve        (user-managed filter rules via webmail-filters script)
```

**Blocked capabilities** (admin-only):
```
urn:ietf:params:jmap:admin        (server administration)
```

Note: Sieve is allowed because the webmail manages user filter rules via the `webmail-filters`
script. The proxy validates that Sieve operations only target the user's own scripts (not
`hosting-forwards` or `hosting-active` which are platform-managed).

**Acceptance Criteria:**
- [ ] Only authenticated users can access the proxy
- [ ] AccountId in JMAP request must match session's accountId (prevents cross-account access)
- [ ] Request body size limited to 1MB
- [ ] Blocked capabilities return 403
- [ ] Stalwart errors are forwarded with appropriate status codes
- [ ] Response streaming (not buffering entire response in memory)
- [ ] Request timeout: 30 seconds
- [ ] Metrics: request count, latency histogram, error rate (per JMAP method)
- [ ] No credential leakage in error responses

### 1.5 — Blob Proxy (Attachments)

`internal/webmail/handler/blob.go`:

**POST /api/blob/upload**
1. Validate session
2. Accept multipart/form-data upload (max size from config, default 25MB)
3. For each file part:
   - Validate content type against allowlist (no executable types)
   - Upload to Stalwart via JMAP Blob/upload
4. Return `{blobId, type, size}` for each uploaded file

**GET /api/blob/{blobId}**
1. Validate session
2. Fetch blob from Stalwart via JMAP Blob/get or download endpoint
3. Set `Content-Disposition: attachment` (force download, never inline — prevents XSS via uploaded HTML)
4. Set `X-Content-Type-Options: nosniff`
5. Stream blob to client

**GET /api/blob/{blobId}/inline**
1. Same as above but for inline display (images in email body)
2. Only allow safe content types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml` (SVG sanitized)
3. Set `Content-Disposition: inline`
4. Add `Content-Security-Policy: sandbox` header

**Blocked content types for upload:**
```
application/x-executable
application/x-msdos-program
application/x-msdownload
application/x-sh
application/x-csh
text/html (as attachment — could be used for phishing)
```

**Acceptance Criteria:**
- [ ] Upload size enforced at both HTTP and application layer
- [ ] Content-type validation on upload
- [ ] Downloads always set Content-Disposition: attachment (except inline images)
- [ ] Inline endpoint only serves safe image types
- [ ] X-Content-Type-Options: nosniff on all blob responses
- [ ] SVG files sanitized to remove script tags before inline serving
- [ ] Streaming: large attachments are streamed, not buffered in memory
- [ ] Upload returns proper JMAP blobId for use in Email/set

### 1.6 — Middleware Stack

`internal/webmail/middleware/`:

**Auth middleware** (`auth.go`):
- Extracts and validates session cookie on all /api/* routes (except /api/auth/login)
- Injects session data into request context
- Returns 401 for invalid/expired sessions

**Rate limiting** (`ratelimit.go`):
- Token bucket per user (identified by session email)
- Default: 120 requests/minute
- Login endpoint: separate stricter limits (10/min per email, 30/min per IP)
- Returns 429 with `Retry-After` header

**Security headers** (`security.go`):
Applied to all responses:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**CORS** (if needed for dev):
- Only allow configured origins
- No wildcard origins in production

**Request logging** (via zerolog):
- Log method, path, status, duration, user email (from session)
- Never log request/response bodies (may contain email content)
- Never log credentials or session tokens

**Acceptance Criteria:**
- [ ] Auth middleware rejects all unauthenticated requests except login
- [ ] Rate limiting returns 429 with appropriate Retry-After header
- [ ] All security headers present on every response
- [ ] CSP blocks inline scripts and external resources
- [ ] CORS strictly configured (no wildcard in production)
- [ ] Request logs include user context but never sensitive data
- [ ] Middleware ordering: security headers → rate limit → auth → handler

### 1.7 — Health & Metrics

**GET /healthz** — Liveness probe (always 200)
**GET /readyz** — Readiness probe (checks Stalwart connectivity)
**GET /metrics** — Prometheus metrics endpoint

Metrics exposed:
- `webmail_requests_total{method, path, status}` — request counter
- `webmail_request_duration_seconds{method, path}` — latency histogram
- `webmail_active_sessions` — gauge of unique session emails seen in last 5 minutes
- `webmail_jmap_proxy_duration_seconds{jmap_method}` — Stalwart call latency
- `webmail_blob_upload_bytes_total` — attachment upload volume
- `webmail_auth_attempts_total{result}` — login success/failure counter

**Acceptance Criteria:**
- [ ] Liveness probe returns 200 immediately
- [ ] Readiness probe validates Stalwart URL is reachable
- [ ] All metrics registered and exposed at /metrics
- [ ] Metrics follow Prometheus naming conventions

### 1.8 — WebSocket Handler

`internal/handler/websocket.go` + `internal/ws/`:

The WebSocket handler provides real-time push updates from Stalwart to the browser. See `03-realtime-and-async.md` for full architecture.

**GET /api/ws** (WebSocket upgrade):
1. Validate session cookie (same auth as HTTP endpoints)
2. Upgrade to WebSocket (gorilla/websocket or coder/websocket)
3. Subscribe to Stalwart's JMAP EventSource for this user's account
4. Relay state change events as JSON WebSocket messages
5. Heartbeat: send `ping` every 30 seconds, expect `pong` within 10 seconds
6. On disconnect: clean up EventSource subscription

**WebSocket hub (`internal/ws/hub.go`):**
- Manages all active WebSocket connections
- Routes Stalwart EventSource updates to the correct user's connections
- Supports multiple connections per user (multiple browser tabs)
- Lock-free broadcast using Go channels

**Stalwart EventSource subscriber (`internal/ws/eventsource.go`):**
- Connects to Stalwart's JMAP EventSource endpoint with user credentials
- Parses SSE events (state changes for Email, Mailbox, etc.)
- Forwards to WebSocket hub for relay to browser
- Reconnects with exponential backoff on disconnect

**Temporal integration (for bulk operations):**
- Subscribes to Valkey pub/sub channel `webmail:progress:{accountId}`
- Relays progress events from Temporal activities to WebSocket
- Progress messages: `{type: "taskProgress", taskId, progress, detail, status}`

**Acceptance Criteria:**
- [ ] WebSocket connection established via session cookie auth
- [ ] Stalwart EventSource subscribed per user
- [ ] State change events relayed to browser within 100ms
- [ ] Heartbeat detects dead connections (30s ping, 10s timeout)
- [ ] Multiple tabs per user supported independently
- [ ] Clean shutdown: graceful WebSocket close on server stop
- [ ] Memory: <50KB per WebSocket connection
- [ ] Scales to 10,000+ concurrent connections per instance
- [ ] Temporal progress events relayed via Valkey pub/sub

### 1.9 — Entry Point & Router

`cmd/webmail-api/main.go`:

```go
func main() {
    // Load config
    // Connect to webmail PostgreSQL DB (pgx pool)
    // Run goose migrations on startup
    // Initialize session crypto
    // Create Stalwart HTTP client (connection pooling, timeouts)
    // Create Core API HTTP client (for stalwart-context, with WEBMAIL_API_KEY)
    // Initialize WebSocket hub
    // Initialize Valkey client (for Temporal progress relay)
    // Initialize partner middleware (brand resolution from hostname)
    // Build Chi router with middleware stack
    // Register routes
    // Start HTTP server with graceful shutdown
}
```

Router structure:
```
/healthz                    → health.Liveness
/readyz                     → health.Readiness
/metrics                    → promhttp.Handler

# Partner info (public, brand resolved from Host header)
/api/partner                → partner.Get      (no session required, returns branding info)

# Auth (no session required for login)
/api/auth/login             → auth.Login       (rate limited)
/api/auth/logout            → auth.Logout      (session required)
/api/auth/session           → auth.Session     (session required)

# JMAP proxy (→ Stalwart, user credentials)
/api/jmap                   → proxy.JMAP       (session required)

# WebSocket (→ Stalwart EventSource + Valkey pub/sub)
/api/ws                     → websocket.Upgrade (session required)

# Blob/attachment proxy (→ Stalwart)
/api/blob/upload            → blob.Upload      (session required)
/api/blob/{blobId}          → blob.Download    (session required)
/api/blob/{blobId}/inline   → blob.Inline      (session required)
/api/blob/proxy             → blob.ProxyExternal (session required, for external images)

# Settings (→ webmail DB, direct read/write)
/api/settings               → settings.Get/Put (session required)

# PGP (→ webmail DB for own key, WKD/keyserver for external lookup)
/api/pgp/key                → pgp.GetKey/PutKey/DeleteKey (session required, webmail DB)
/api/pgp/lookup             → pgp.Lookup       (session required, webmail DB first, then WKD/keyserver)
/api/wkd/lookup             → wkd.Lookup       (session required, proxies WKD requests for CORS)
```

### Core API Client

The core API is used only for Stalwart context resolution. The result is cached
in the webmail's own database, so the core API is called at most once per email
account (ever), and again only if the cached context becomes stale.

```go
type CoreAPIClient struct {
    httpClient *http.Client
    baseURL    string
    apiKey     string // WEBMAIL_API_KEY
}

// GetStalwartContext resolves the Stalwart URL and token for an email account.
// Called on first login for a new email address. Result cached in webmail DB.
func (c *CoreAPIClient) GetStalwartContext(ctx context.Context, email string) (*StalwartContext, error)

type StalwartContext struct {
    StalwartURL   string `json:"stalwart_url"`
    StalwartToken string `json:"stalwart_token"`
    FQDN          string `json:"fqdn"`
}
```

The core API authenticates via `X-API-Key: {WEBMAIL_API_KEY}` header.
The key is scoped to only the `stalwart-context` endpoint — see `12-hosting-platform-changes.md`.

**Stalwart context caching (webmail DB):**

```sql
-- Part of user_preferences table or a separate cache table
-- Stored alongside user preferences for simplicity
ALTER TABLE user_preferences ADD COLUMN stalwart_url TEXT, ADD COLUMN stalwart_token TEXT;
```

Login flow:
1. Check webmail DB for cached `stalwart_url`/`stalwart_token` for this email
2. If found → use it to validate credentials against Stalwart
3. If not found → call core API `GET /email-accounts/by-email/{email}/stalwart-context`
4. Cache result in webmail DB
5. If Stalwart returns connection error or 401 with cached context → re-fetch from core API (stale context recovery)

**Core API call frequency:**

| Event | Core API calls |
|-------|---------------|
| First-ever login for an email | 1 (stalwart-context) |
| Subsequent logins (any device) | 0 (cached in webmail DB) |
| Stalwart URL changes (rare) | 1 (re-fetch on connection failure) |
| All other operations | 0 |

**Acceptance Criteria:**
- [ ] Graceful shutdown with 15-second drain (includes WebSocket close frames)
- [ ] PostgreSQL connection pool (pgx, max 25 connections)
- [ ] Goose migrations run on startup
- [ ] HTTP client to Stalwart uses connection pooling (MaxIdleConns: 100, IdleConnTimeout: 90s)
- [ ] Request timeout: 30 seconds
- [ ] Max request body: 26MB (25MB attachment + overhead)
- [ ] Structured startup logging (listen address, DB connected, Core API URL)
- [ ] Passes `go vet ./...` and `go build ./...`
- [ ] WebSocket hub starts and stops cleanly with the server
- [ ] Preferences read/written directly to webmail DB (no core API)
- [ ] PGP keys read/written directly to webmail DB (no core API)
- [ ] Stalwart context cached in webmail DB, re-fetched on connection failure
- [ ] Core API called only for stalwart-context (not for preferences, PGP, or mail operations)
- [ ] Partner/brand resolved from Host header via middleware

## Security Considerations

1. **No direct Stalwart access**: The webmail API is the only way to reach Stalwart from the browser. Stalwart's ports are not exposed to the internet.
2. **Credential handling**: User passwords are encrypted in the session cookie with AES-256-GCM. They exist in plaintext only during the JMAP proxy call (in the Authorization header to Stalwart, over internal HTTPS).
3. **Tenant isolation**: The proxy validates that all JMAP method calls reference only the authenticated user's accountId. A compromised frontend cannot access another user's mail.
4. **No admin escalation**: Admin-only JMAP capabilities (admin) are blocked at the proxy level. Sieve is allowed for user filter management (the webmail deploys `webmail-filters` script on behalf of the user).
5. **Rate limiting**: Prevents brute-force login attempts and API abuse.
6. **WebSocket security**: Origin validation, session cookie auth, message schema validation.
7. **PGP proxy**: WKD and keyserver lookups proxied through backend (prevents CORS issues and hides user's IP from keyservers).
8. **Service-to-service auth**: Core API access uses scoped `WEBMAIL_API_KEY` — only allows `stalwart-context` endpoint. Never exposed to the browser.
