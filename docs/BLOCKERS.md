# Implementation Blockers & Questions

Questions and decisions that came up during implementation. Review when available.

---

## Resolved

### Stalwart JMAP session endpoint path
The plan references `GET {stalwartURL}/jmap` for JMAP session discovery. The actual Stalwart endpoint is `/.well-known/jmap` (RFC 8620 compliant). The JMAP API endpoint for method calls is `/jmap/` (with trailing slash). Updated in implementation.

### Core API stalwart-context endpoint
Implemented in Phase 0 (hosting platform). Route: `GET /api/v1/email-accounts/by-email/{email}/stalwart-context`.

### Phase 5 contact type errors / Phase 7 PGP type errors
All resolved during consolidation. `tsc --noEmit` and `npm run build` both pass clean.

---

## Open

### Sieve blob proxy endpoints
The filter rules hook (`use-filter-rules.ts`) needs to fetch and upload Sieve script content via Stalwart's blob API. Currently assumes `GET /api/jmap/blob/{blobId}` and `POST /api/jmap/upload` exist — these need to be added as proxy routes in the Go backend.

### Playwright E2E tests — 431 header too large
All Playwright tests fail with `431 Request Header Fields Too Large`. The encrypted session cookie exceeds Vite dev server's default 16KB header limit. Fix options:
- Set `NODE_OPTIONS=--max-http-header-size=32768` in Playwright config
- Or reduce session cookie size (compress/shorten fields)
