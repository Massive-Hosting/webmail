# Open Questions & Decisions

Resolved questions from planning. Kept as a record for agents.

## Q1: Stalwart URL Resolution

**Decision: Option A — Core API resolves Stalwart URL.**

The Stalwart URL is per-cluster, resolved dynamically via `FQDN → Tenant → Cluster → config`.
The webmail API calls `GET /email-accounts/by-email/{email}/stalwart-context` on login,
caches the result in the session cookie.

Login flow:
1. User submits email + password
2. Webmail API calls core API for stalwart-context (1 network call, cached for session)
3. Webmail API validates credentials against the resolved Stalwart instance
4. Session cookie stores stalwartURL + credentials (encrypted)

Single global webmail instance, not one per cluster.

---

## Q2: Stalwart JMAP Capabilities

**Decision: All confirmed. No architecture changes needed.**

Verified via Stalwart source code (github.com/stalwartlabs/stalwart):

| Capability | Status | Source |
|---|---|---|
| JMAP Contacts (JSContact, RFC 9610) | Confirmed | `crates/jmap/src/contact/` |
| JMAP Calendars (JSCalendar) | Confirmed | `crates/jmap/src/calendar_event/` |
| JMAP EventSource push | Confirmed | `/jmap/eventsource/` endpoint |
| Email/changes delta sync | Confirmed | `crates/jmap/src/changes/get.rs` |
| Identity/get + Identity/set (signatures) | Confirmed | `crates/jmap-proto/src/object/identity.rs` (textSignature, htmlSignature, 2048 char limit) |
| EmailSubmission/set | Confirmed | `crates/jmap/src/submission/` |

The entire planned architecture is validated.

---

## Q3: Sieve Script Coexistence

**Decision: Use `include :personal` for script composition.**

Stalwart supports only one active Sieve script at a time, but supports `include :personal "script_name"`
to compose multiple scripts. The approach:

1. Platform deploys `hosting-forwards` script (forwards, managed by hosting workflows)
2. Webmail deploys `webmail-filters` script (user filter rules, managed by webmail)
3. A master script `hosting-active` is the active script and includes both:

```sieve
require ["include"];
include :personal "hosting-forwards";
include :personal "webmail-filters";
```

The platform manages `hosting-active` and `hosting-forwards`. The webmail manages `webmail-filters`.
Neither overwrites the other. The hosting platform needs a small change: instead of activating
`hosting-forwards` directly, it creates/updates `hosting-active` as the wrapper.

If no forwards exist, `hosting-forwards` is an empty script (or omitted from the include).
If no user filters exist, `webmail-filters` doesn't exist (the include silently fails or is omitted).

---

## Q4: Testing Strategy

**Decision: Agreed.**

**Backend (Go):**
- Unit tests: session crypto, JMAP validation, cache, config. `go test ./...`
- E2E: `WEBMAIL_E2E=1 go test ./tests/e2e/... -v` (requires Stalwart)
- Mock Stalwart via httptest.Server for unit tests

**Frontend (TypeScript/React):**
- Unit/component: Vitest + Testing Library. `npx vitest`
- E2E: Playwright. `npx playwright test`

**CI:** `go test` + `go vet` + `npx vitest run` on every PR. Playwright as separate job.

---

## Q5: Deployment & Domain

**Decision: Single global instance. URL configurable per brand (like controlpanel).**

The webmail follows the controlpanel's branding pattern:
- Own database with `brands`, `partners` tables
- Partner hostname middleware resolves brand from request Host header
- Each brand/partner has: hostname, primary_color, logo_url
- Example: `mail.myhosting.com` for brand A, `webmail.otherhost.com` for brand B

This means the webmail gets its own PostgreSQL database (like the controlpanel has a separate DB
from the core). The database stores: brands, partners, and potentially other webmail-specific
data in the future.

---

## Q6: PGP Passphrase

**Decision: Derive from email password.**

- PGP private key passphrase = PBKDF2(email_password, salt, 100000)
- User never needs to remember a separate passphrase
- On password change: webmail detects stale key on next login, prompts for old password to re-encrypt
- Recovery key generated during setup as backup (like 2FA backup codes)
- If recovery fails: user can re-generate PGP key (old encrypted emails become unreadable — documented)

---

## Q7: Design Reference

**Decision: Reference Outlook Web Access 2026 for layout proportions and interaction patterns.**

Agents should:
- Use Outlook Web as a reference for layout, spacing, and interaction flow
- Use the color tokens defined in `02-core-mail-ui.md`
- Prioritize clean whitespace and premium feel over information density
- Not create a blatant copy — take inspiration but build our own identity
- The indigo/violet accent color differentiates us visually
