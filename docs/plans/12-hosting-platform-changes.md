# Hosting Platform Changes

## Goal

Document all changes required in the hosting platform (`~/projects/hosting`) to support the webmail client. These changes are minimal — a scoped API key, one new endpoint, a Sieve script composition change, and WKD serving in nginx. No new columns on existing tables (preferences and PGP keys live in the webmail's own DB).

## 1. Scoped API Keys

The hosting core API currently uses `AGENT_API_KEY` for service-to-service auth. The webmail needs its own key with a restricted scope — if the webmail API is compromised, the attacker can only resolve Stalwart connection info, not create/delete accounts or manage infrastructure.

### Design

Add a scoped API key system to the core API:

**Config (`internal/config/config.go`):**
```go
WebmailAPIKey string // WEBMAIL_API_KEY — scoped key for webmail service
```

**Middleware (`internal/api/middleware/`):**

Create a `ServiceAuth` middleware that:
1. Checks `X-API-Key` header
2. Matches against known service keys
3. Resolves the key's scope (which endpoints it can access)
4. Injects the scope into the request context

```go
type ServiceScope struct {
    Name   string   // "webmail", "agent", etc.
    Routes []string // allowed route patterns
}

var serviceScopes = map[string]ServiceScope{
    // WEBMAIL_API_KEY can only access this route:
    "webmail": {
        Name: "webmail",
        Routes: []string{
            "GET /email-accounts/by-email/*/stalwart-context",
        },
    },
    // AGENT_API_KEY retains full access (existing behavior)
    "agent": {
        Name: "agent",
        Routes: []string{"*"},
    },
}
```

Hardcoded scope map (Option A). Explicit, auditable, no new tables.

**Acceptance Criteria:**
- [ ] `WEBMAIL_API_KEY` env var loaded in config
- [ ] ServiceAuth middleware resolves key → scope
- [ ] Webmail key can only access `stalwart-context` endpoint
- [ ] Webmail key cannot access account CRUD, domain management, or any other endpoints
- [ ] Unknown API keys return 401
- [ ] Scope violation returns 403 with clear error
- [ ] `AGENT_API_KEY` retains full access (backward compatible)
- [ ] Config validation: warns if WEBMAIL_API_KEY is the same as AGENT_API_KEY

## 2. New API Endpoint: Stalwart Context

Add to the core API router (authenticated via ServiceAuth middleware):

**GET /email-accounts/by-email/{email}/stalwart-context**
- Resolves the Stalwart connection info for a given email account
- Uses the existing resolution chain: `email → FQDN → Tenant (via mail_tenant_id) → Cluster → config`
- Returns:
  ```json
  {
    "stalwart_url": "http://10.10.10.200:8081",
    "stalwart_token": "...",
    "fqdn": "example.com"
  }
  ```
- Called once per webmail login, cached for the session duration
- This reuses the same resolution logic as `GetStalwartContext` activity but exposed as an HTTP endpoint

**Helper:**
```go
func (s *EmailAccountService) GetByEmail(ctx context.Context, email string) (*model.EmailAccount, error)
```
Queries: `SELECT * FROM email_accounts WHERE address = $1`

**Acceptance Criteria:**
- [ ] Endpoint accessible via `WEBMAIL_API_KEY` only
- [ ] Returns correct Stalwart URL and token for the email's cluster
- [ ] Returns 404 for unknown email addresses
- [ ] Does not expose internal IDs (no account ID, tenant ID, cluster ID in response)
- [ ] Response includes the FQDN (needed for domain-level operations)

## 3. Sieve Script Composition

Change how the hosting platform activates Sieve scripts to support coexistence with
webmail user filters.

**Current behavior:**
- Platform deploys `hosting-forwards` and activates it directly

**New behavior:**
- Platform deploys `hosting-forwards` (unchanged content)
- Platform creates/updates a master script `hosting-active` that includes sub-scripts:

```sieve
require ["include"];
include :personal "hosting-forwards";
include :personal "webmail-filters";
```

- `hosting-active` is the only activated script
- The webmail manages `webmail-filters` independently (user filter rules)
- Neither system overwrites the other's script

**Handling missing scripts:**
- If `webmail-filters` doesn't exist (user has no filters), Stalwart's `include :personal`
  for a non-existent script should be handled gracefully. If Stalwart errors on missing
  includes, the master script should only include scripts that exist (check via SieveScript/query
  before generating the master).

**Files to change:**
- `internal/workflow/email_forward.go` — after deploying `hosting-forwards`, also deploy/update `hosting-active`
- `internal/stalwart/jmap.go` — add helper to deploy the master include script

**Acceptance Criteria:**
- [ ] `hosting-active` is the activated script (not `hosting-forwards` directly)
- [ ] `hosting-forwards` content unchanged
- [ ] `hosting-active` includes both `hosting-forwards` and `webmail-filters`
- [ ] Missing `webmail-filters` doesn't cause errors
- [ ] Existing forward workflows continue to work unchanged
- [ ] Webmail can deploy `webmail-filters` without touching `hosting-active` or `hosting-forwards`

## 4. WKD Serving (Web Key Directory)

When an email account has a PGP public key (stored in the webmail's DB), the hosting platform
should serve it via the WKD protocol. The webmail API notifies the hosting platform when a key
changes.

**Approach:**
The webmail API calls a core API endpoint when a PGP key is uploaded/deleted:
`POST /email-accounts/by-email/{email}/wkd-sync` with the armored public key (or empty body for deletion).
This triggers the node agent to update the WKD directory on the next convergence.

Alternatively, the node agent could pull PGP keys from the webmail API directly during convergence.
The simplest approach: store a copy of PGP public keys in the core DB for WKD purposes only
(the webmail DB is the source of truth, but a sync copy enables WKD without the node agent
needing to talk to the webmail API).

**Implementation decision needed:** Pick the sync approach during implementation. Either:
- A: Core API stores a WKD copy, webmail pushes on change (add `pgp_public_key` column to core DB)
- B: Node agent pulls from webmail API during convergence (add webmail API endpoint for bulk key fetch)

**WKD directory structure:**
```
/var/www/{fqdn}/.well-known/openpgpkey/hu/{hash}  → binary key
/var/www/{fqdn}/.well-known/openpgpkey/policy      → empty file
```

`{hash}` = z-base-32 encoded SHA-1 of lowercase local part.

**Nginx config:**
```nginx
location /.well-known/openpgpkey/ {
    root /var/www/{fqdn};
    default_type application/octet-stream;
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET";
}
```

**Acceptance Criteria:**
- [ ] WKD directory generated for FQDNs with PGP-enabled accounts
- [ ] Key hash computed correctly (SHA-1 of local part, z-base-32 encoded)
- [ ] Binary key served at correct WKD path
- [ ] Empty policy file present
- [ ] CORS headers set on WKD responses
- [ ] Key files cleaned up when PGP key is removed
- [ ] External GPG/Thunderbird can discover keys via `gpg --locate-keys alice@example.com`

## 5. Helm Chart Updates

Add webmail configuration to the hosting Helm chart:

**values.yaml:**
```yaml
webmail:
  enabled: true
  image: webmail:latest
  replicas: 1
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi

secrets:
  webmailApiKey: ""  # WEBMAIL_API_KEY for service-to-service auth
```

**templates/secret.yaml:** Add `WEBMAIL_API_KEY`
**templates/configmap.yaml:** Add `WEBMAIL_CORE_API_URL`, `WEBMAIL_DATABASE_URL`
**New template:** `webmail-deployment.yaml`, `webmail-service.yaml`

**Acceptance Criteria:**
- [ ] Webmail deploys as part of the Helm chart
- [ ] `WEBMAIL_API_KEY` injected via Secret
- [ ] Core API URL and database URL injected
- [ ] Health/readiness probes configured
- [ ] Ingress routes webmail hostname to webmail service

## Summary of Hosting Platform Changes

| Area | Change | Files |
|------|--------|-------|
| Config | Add `WEBMAIL_API_KEY` env var | `internal/config/config.go` |
| Middleware | Scoped API key auth | `internal/api/middleware/` (new) |
| Handler | 1 new endpoint (`stalwart-context`) | `internal/api/handler/` |
| Service | `GetByEmail` method + Stalwart context resolution | `internal/core/` |
| Sieve | Master include script (`hosting-active`) | `internal/workflow/`, `internal/stalwart/jmap.go` |
| Node agent | WKD directory convergence | `internal/activity/` |
| Nginx | WKD location block | nginx config template |
| Helm | Webmail deployment + secrets | `deploy/helm/hosting/` |

Note: No migrations on the core DB. Preferences and PGP keys live in the webmail's own database.
