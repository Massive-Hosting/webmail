# Security Plan

## Goal

The webmail handles sensitive data (personal emails, credentials, contacts). Security is not a phase — it's a constraint applied to every phase. This document defines the security model, threat landscape, and specific controls.

## Threat Model

### Assets
1. **Email content**: Private messages, potentially containing sensitive business/personal information
2. **Credentials**: Email passwords (in encrypted session cookies)
3. **Contacts**: Personal address book data
4. **Calendar**: Meeting details, attendees, locations
5. **Attachments**: Files of any type

### Threat Actors
1. **External attacker**: Attempting unauthorized access via the web interface
2. **Malicious email sender**: Attempting XSS/phishing via crafted email content
3. **Network eavesdropper**: MITM on network path
4. **Other tenant**: Attempting cross-tenant data access
5. **Compromised browser extension**: Attempting to exfiltrate data from the page

### Attack Surfaces
1. **Authentication**: Login endpoint (brute force, credential stuffing)
2. **Session management**: Cookie theft, session fixation
3. **Email rendering**: XSS via HTML email, CSS injection, tracking pixels
4. **Attachment handling**: Malicious file upload/download, content-type confusion
5. **JMAP proxy**: Unauthorized cross-account access, request smuggling
6. **Client-side storage**: LocalStorage data exposure
7. **WebSocket**: Connection hijacking, message injection

## Security Controls

### 1. Authentication Security

**Brute force protection:**
- Rate limit login: 10 attempts per email per minute
- Rate limit by IP: 30 attempts per minute
- After 5 consecutive failures for an email: 5-minute lockout
- Lockout state stored in Go's `sync.Map` (in-memory, resets on restart — acceptable for DoS mitigation)
- Failed attempts logged with IP address for monitoring
- No user enumeration: same error message for invalid user and wrong password

**Session security:**
- AES-256-GCM encrypted cookie (random nonce per encryption)
- Cookie attributes: HttpOnly, Secure, SameSite=Strict, Path=/api
- Session expiry: 24 hours (configurable), sliding window refresh
- Session bound to user agent (UA hash included in session data, validated on each request)
- No session tokens in URLs (ever)
- Logout clears cookie (Max-Age=0) and client-side state

**Password handling:**
- Password exists in memory only during login and JMAP proxy calls
- Password encrypted in cookie with AES-256-GCM (not base64, not reversible without key)
- Password never logged, never included in error messages
- Password never sent to any endpoint other than Stalwart

### 2. Email Content Security (XSS Prevention)

This is the highest-risk area — email HTML is attacker-controlled content rendered in the user's browser.

**HTML sanitization (DOMPurify configuration):**
```typescript
const sanitizeConfig = {
  ALLOWED_TAGS: [
    // Text formatting
    'p', 'br', 'hr', 'span', 'div', 'pre', 'code',
    'b', 'i', 'u', 's', 'em', 'strong', 'mark', 'small', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Links and images
    'a', 'img',
    // Semantic
    'blockquote', 'cite', 'abbr', 'address', 'details', 'summary',
    // Media (limited)
    'figure', 'figcaption',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'width', 'height',
    'style', 'class', 'dir', 'lang',
    'colspan', 'rowspan', 'scope', 'headers',
    'target', 'rel',
    'border', 'cellpadding', 'cellspacing', 'align', 'valign',
    'bgcolor', 'color',
  ],
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'applet',
    'form', 'input', 'textarea', 'select', 'button',
    'meta', 'link', 'base', 'svg', 'math',
    'video', 'audio', 'source', 'track',
    'style', // no <style> blocks — only inline styles allowed
  ],
  FORBID_ATTR: [
    // Event handlers
    'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
    'onmouseenter', 'onmouseleave', 'onmousedown', 'onmouseup',
    'ontouchstart', 'ontouchend', 'onanimationstart', 'ontransitionend',
    // Dangerous attributes
    'formaction', 'xlink:href', 'data-bind',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
  // Force all links to open in new tab
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};
```

**Post-sanitization processing:**
1. All `<a>` tags: add `target="_blank" rel="noopener noreferrer"` (prevent tab-nabbing)
2. All `style` attributes: parse and whitelist safe CSS properties:
   - Allow: color, background-color, font-size, font-weight, font-family, text-align, text-decoration, padding, margin, border, width, height, display, vertical-align, line-height, white-space
   - Block: position, z-index, opacity (can overlay UI), cursor, pointer-events, content, expression(), url() in non-background-image contexts, -moz-binding, behavior
3. External image URLs: replace `src` with placeholder, show "Load external images" bar
4. `cid:` image references: resolve to `/api/blob/{blobId}/inline` URLs

**CSS injection prevention:**
- No `<style>` blocks (stripped by DOMPurify)
- Inline `style` attributes whitelisted per property
- No CSS `url()` except in `background-image` (and those are blocked by default → external images)
- No CSS `expression()` (IE-specific XSS vector)
- No CSS `@import`

**Email content rendering isolation:**
- Email HTML rendered in a `<div>` with explicit `all: initial` CSS reset
- Email styles cannot leak out to affect the webmail UI
- Consider Shadow DOM for stronger isolation (evaluate performance impact)

### 3. External Image / Tracking Pixel Protection

**Default: block all external resources**
- External `<img>` sources replaced with placeholder
- CSS `background-image: url(...)` stripped
- "Load external images" banner shown above message

**When user clicks "Load external images":**
- Images loaded through the backend proxy: `/api/blob/proxy?url={encoded_url}`
- Backend fetches image, validates content-type (image/* only), streams to client
- Strips query parameters that could be tracking identifiers (configurable)
- Caches fetched images briefly (5 min) to avoid redundant fetches
- Size limit: 5MB per external image

**"Always load from this sender" option:**
- Stored in roaming preferences (`trustedImageDomains` array in `webmail_preferences` JSONB)
- Keyed by sender's email domain (not full address — reduces granularity but prevents per-address tracking)

**Acceptance Criteria:**
- [ ] External images blocked by default in all messages
- [ ] "Load external images" button loads images via backend proxy
- [ ] Proxy validates content-type (rejects non-image)
- [ ] Proxy strips tracking query parameters
- [ ] "Always trust" option persists per sender domain
- [ ] No external resource loading without explicit user action

### 4. Attachment Security

**Upload validation (backend):**
- File size: max 25MB per file, 25MB total per email
- Content-type validation: check magic bytes, not just Content-Type header
- Blocked types: executables (.exe, .bat, .cmd, .sh, .ps1), archives with executables
- Virus scanning: integrate with ClamAV if available (optional, non-blocking)

**Download safety:**
- All downloads: `Content-Disposition: attachment` (force save dialog)
- `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
- No inline rendering of HTML/SVG/PDF attachments (could contain scripts)
- Image preview: only for `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- `Content-Security-Policy: sandbox` on all blob responses

**Acceptance Criteria:**
- [ ] Backend validates file magic bytes match declared content-type
- [ ] Executables rejected on upload with clear error message
- [ ] Downloads always trigger save dialog (never inline rendering)
- [ ] Image previews only for safe image types
- [ ] X-Content-Type-Options: nosniff on all blob responses
- [ ] CSP sandbox header on blob downloads

### 5. Transport Security

**HTTPS enforcement:**
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- HTTP → HTTPS redirect at ingress/nginx level
- No mixed content (all resources served over HTTPS)

**WebSocket security:**
- Authenticated via session cookie (same-origin, HttpOnly cookie included automatically)
- Origin validation: reject connections from unexpected origins
- Message validation: all received messages validated against expected schema
- Connection timeout: 30s heartbeat, close on missed pong

**Internal communication:**
- Webmail API → Stalwart: HTTPS (even internal — Stalwart has its own TLS)
- Basic auth credentials sent only over HTTPS
- Connection pooling with TLS session reuse

### 6. Content Security Policy

Applied to the webmail SPA (not to blob downloads which have their own CSP):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  connect-src 'self' wss:;
  font-src 'self';
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
```

Notes:
- `style-src 'unsafe-inline'` needed for Tailwind and inline email styles (in sanitized container)
- `img-src data: blob:` needed for inline images and avatar generation
- `connect-src wss:` needed for WebSocket
- `frame-src 'none'` prevents clickjacking and iframe injection
- `frame-ancestors 'none'` prevents embedding the webmail in iframes

### 7. JMAP Proxy Security

**Tenant isolation:**
- Every JMAP method call in a request is inspected
- `accountId` in every method call must match the session's authenticated accountId
- Requests with mismatched accountIds are rejected with 403
- No admin capabilities exposed (urn:ietf:params:jmap:sieve, admin)

**Request validation:**
- Request body size limit: 1MB
- Method call count limit: 20 per request
- Only known JMAP methods allowed (whitelist)

**Response sanitization:**
- JMAP error responses from Stalwart are sanitized (remove internal details)
- Stack traces from Stalwart are never forwarded to the client

### 8. Client-Side Security

**localStorage / client-side data:**
- localStorage used only as a write-ahead cache for roaming preferences (actual source of truth is server-side)
- No credentials, no email content, no session tokens in localStorage
- PGP private keys in IndexedDB (encrypted with passphrase-derived key)
- No sensitive data stored unencrypted on the client

**Memory security:**
- Credential data in Zustand cleared on logout
- No sensitive data in browser history (SPA with hash/path routing)

### 9. Monitoring & Audit

**Security-relevant log events (zerolog):**
- Login success/failure (with IP, sanitized email)
- Session creation/expiry
- Rate limit triggered
- Blocked capability attempt
- Cross-account access attempt
- File upload (type, size)
- WebSocket connect/disconnect

**Prometheus metrics:**
- `webmail_auth_failures_total` — counter for failed logins (alert threshold: >50/min)
- `webmail_rate_limit_hits_total` — counter for rate limit triggers
- `webmail_blocked_requests_total{reason}` — counter for security rejections
- `webmail_session_count` — gauge of active sessions

**Alerting recommendations:**
- Auth failures >50/min → possible credential stuffing
- Blocked requests >10/min from single IP → possible attack
- Cross-account attempts → definite attack, investigate

### 10. Security Testing Checklist

Before each release:
- [ ] Run DOMPurify against OWASP XSS filter evasion cheat sheet payloads
- [ ] Verify CSP headers with Mozilla Observatory
- [ ] Test session cookie attributes (HttpOnly, Secure, SameSite)
- [ ] Test cross-account JMAP request rejection
- [ ] Test rate limiting under load
- [ ] Test attachment upload with malicious file types
- [ ] Test external image blocking and proxy
- [ ] Verify no credential leakage in logs
- [ ] Test WebSocket origin validation
- [ ] Review DOMPurify version for known bypasses
