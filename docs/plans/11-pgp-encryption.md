# Phase 7 — PGP Encryption & Signing

## Goal

End-to-end email encryption and digital signing using OpenPGP, executed entirely client-side. Private keys never leave the browser. This is a major differentiator — no mainstream webmail (Gmail, Outlook, Yahoo) offers native PGP support. ProtonMail does, but only within their walled garden. We do it with standard OpenPGP, compatible with every PGP implementation.

## Principles

1. **Client-side only**: All cryptographic operations happen in the browser using OpenPGP.js. The backend never sees plaintext of encrypted messages or private keys.
2. **Standard OpenPGP**: Full RFC 4880 / RFC 9580 compliance. Messages encrypted here can be decrypted by GPG, Thunderbird, K-9 Mail, etc.
3. **Zero knowledge**: The server stores encrypted messages as opaque MIME blobs. It cannot read encrypted content.
4. **Progressive**: PGP is opt-in. Users who don't use PGP see no difference. Users who do get first-class support.
5. **Key discovery**: Automatic key lookup via WKD (Web Key Directory) and keys.openpgp.org for seamless encryption to new contacts.

## Architecture

```
Browser (OpenPGP.js)
  |
  |  1. Fetch encrypted email via JMAP (through proxy)
  |  2. Detect PGP/MIME or inline PGP
  |  3. Decrypt with user's private key (stored in browser)
  |  4. Render plaintext in reading pane
  |
  |  OR (sending):
  |
  |  1. Compose plaintext message
  |  2. Encrypt with recipient's public key + sign with sender's private key
  |  3. Wrap as PGP/MIME
  |  4. Submit via JMAP (through proxy) — proxy sees only ciphertext
```

The backend is completely unaware of PGP — it proxies encrypted MIME just like any other email.

## Dependencies

- **OpenPGP.js** (v6+): Pure JavaScript OpenPGP implementation, runs in browser and Web Workers
- No backend dependencies

## Tasks

### 7.1 — Key Management

Users need to manage their PGP keys. This is the foundation everything else builds on.

**Key storage:**

| Key type | Storage | Roams? | Why |
|----------|---------|--------|-----|
| User's private key | Browser IndexedDB (encrypted) | No | Zero-knowledge — server never sees private keys |
| User's public key | Webmail DB (`user_preferences.pgp_public_key`) | Yes | Enables WKD serving + platform-wide discovery |
| Contacts' public keys | Webmail DB (for platform users) + local IndexedDB cache (for external contacts) | Partially | Platform users' keys always available; external keys cached locally after WKD/keyserver lookup |
| PGP trust decisions | Webmail DB (in `user_preferences.preferences` JSONB) | Yes | "Verified" trust markings follow the user |

- Private key IndexedDB storage encrypted with PBKDF2(passphrase, salt, 100000 iterations) → AES-256-GCM
- Passphrase prompted once per session, cached in memory (Zustand store, cleared on logout)
- On key generation, public key is automatically pushed to webmail DB via `PUT /api/pgp/key`
- Private keys are inherently device-bound — this is a security feature, not a limitation. Users who want multi-device PGP must import their private key on each device (standard PGP practice)

**One-click setup (primary flow for most users):**

Most users know nothing about PGP. The setup must be as easy as flipping a switch.
No jargon (no "key pair", "algorithm", "armor"). The UI speaks in terms of outcomes.

```
Settings → Security → Email Signing

+----------------------------------------------------------+
|  Digitally Sign Your Emails                              |
+----------------------------------------------------------+
|                                                          |
|  When you sign your emails, recipients can verify that   |
|  the message really came from you and wasn't tampered    |
|  with. This is like a digital wax seal.                  |
|                                                          |
|  [  Enable Email Signing  ]                              |
|                                                          |
+----------------------------------------------------------+
```

Clicking "Enable Email Signing" triggers the **zero-config flow**:
1. Generate ECC Curve25519 key (fastest, most secure, no user choice needed)
2. Name and email auto-filled from JMAP Identity
3. Passphrase: use the user's email password (already in session) — derived via PBKDF2 so
   the raw password isn't the passphrase, but the user never needs to remember a separate one
4. Expiry: 2 years (sensible default)
5. Key generated in Web Worker (<1 second for ECC)
6. Public key automatically published to the hosting platform (`PUT /api/pgp/key`)
7. Show success: "Email signing is enabled. Your emails will now carry a digital signature."
8. Signing turned on by default for all new messages

The user never sees: key algorithms, fingerprints, armored text, or the word "PGP".

**What the user sees after setup:**
- A green shield icon in their compose toolbar (always on, can be toggled off per-message)
- Recipients with PGP keys get a lock icon (encryption available)
- That's it

**Advanced setup (for power users):**

Behind a "Advanced PGP Settings" link at the bottom of the signing settings:

```
+----------------------------------------------------------+
| Advanced PGP Settings                                    |
+----------------------------------------------------------+
| Your Key:                                                |
| ┌────────────────────────────────────────────────────┐   |
| │ alice@example.com                                  │   |
| │ Fingerprint: 6F2C 8B1D A4E3 7890 ...              │   |
| │ Algorithm: ECC Curve25519                          │   |
| │ Created: Mar 14, 2026  Expires: Mar 14, 2028       │   |
| │ [Export Public] [Export Private] [Revoke]           │   |
| └────────────────────────────────────────────────────┘   |
|                                                          |
| [Generate New Key (Advanced)]  [Import Existing Key]     |
|                                                          |
| Defaults:                                                |
| Sign outgoing messages:    [Always v]                    |
| Encrypt when keys available: [Ask v]                     |
| Auto-lookup recipient keys:  [x] Enabled                 |
| Key published to directory:  [x] Yes  [Unpublish]        |
+----------------------------------------------------------+
```

**Generate New Key (Advanced):**
```
+----------------------------------------------------------+
| Generate PGP Key (Advanced)                              |
+----------------------------------------------------------+
| Name:       [Alice Johnson                          ]    |
| Email:      [alice@example.com                      ]    |
| Algorithm:  [ECC (Curve25519) v]                         |
|             Options: ECC Curve25519, RSA 4096             |
| Passphrase: [••••••••••••                           ]    |
|             (leave empty to use your email password)      |
| Confirm:    [••••••••••••                           ]    |
| Expiry:     [2 years v]  (None, 1yr, 2yr, 5yr, custom)  |
|                                                          |
|                              [Cancel]  [Generate]        |
+----------------------------------------------------------+
```

**Key import:**
- Import from file: `.asc`, `.gpg`, `.pgp` file upload
- Import from clipboard: paste armored key text
- Import from keyserver: search by email on keys.openpgp.org
- Validate key on import (check format, expiry, algorithm)

**Key publishing (automatic):**
After setup (one-click or advanced), the public key is automatically:
1. Stored in the webmail DB (`user_preferences.pgp_public_key`)
2. Served via WKD so anyone in the world can discover it
3. Optionally uploaded to keys.openpgp.org (one-click, triggers their email verification)

The user is told: "Your public key has been published. Anyone who wants to send you
an encrypted email can now find your key automatically."

**Acceptance Criteria:**
- [ ] One-click setup generates key, publishes it, enables signing — zero jargon, zero choices
- [ ] Passphrase defaults to email-password-derived key (user doesn't need to remember anything new)
- [ ] Setup completes in <3 seconds (ECC key generation + upload)
- [ ] Post-setup: signing is on by default, green shield in compose toolbar
- [ ] Public key auto-published to hosting platform (WKD-discoverable)
- [ ] Advanced settings accessible but hidden by default
- [ ] Advanced flow allows custom passphrase, algorithm choice, key import
- [ ] Existing GPG/Thunderbird users can import their existing key
- [ ] All acceptance criteria from original key generation section still apply

**Key export:**
- Export public key as `.asc` file (armored ASCII)
- Export private key as `.asc` (with passphrase confirmation and security warning)
- Copy public key to clipboard
- QR code display for public key fingerprint (for in-person verification)

**Key directory (public keys of contacts):**
- Automatic lookup via WKD (Web Key Directory) protocol
- Automatic lookup via keys.openpgp.org (HKP)
- Manual import from file or paste
- Cache public keys in IndexedDB, keyed by email
- Key trust levels: Unknown / Verified (user explicitly confirmed fingerprint)
- Show key fingerprint in contact detail view

**Acceptance Criteria:**
- [ ] Key generation produces valid OpenPGP keys (ECC Curve25519 or RSA 4096)
- [ ] Generated keys are stored encrypted in IndexedDB
- [ ] Passphrase required to unlock keys (once per session)
- [ ] Wrong passphrase shows clear error
- [ ] Key import accepts armored ASCII and binary formats
- [ ] Key export produces standard armored ASCII format
- [ ] WKD lookup resolves public keys automatically
- [ ] keys.openpgp.org lookup works as fallback
- [ ] Public key cache persists across sessions
- [ ] Key fingerprint displayed in hex format with spaces (e.g., "6F2C 8B1D ...")
- [ ] Expired keys show warning, cannot be used for encryption
- [ ] Revoked keys show warning, cannot be used for encryption
- [ ] Private keys never sent to the server (verified: no network request contains private key material)

### 7.2 — Decrypt & Verify Incoming Messages

Detect and decrypt PGP-encrypted emails, verify signatures.

**Detection:**
Two PGP email formats to handle:

1. **PGP/MIME** (RFC 3156): Content-Type: `multipart/encrypted; protocol="application/pgp-encrypted"`
   - Part 1: `application/pgp-encrypted` (version identifier)
   - Part 2: `application/octet-stream` (encrypted data)

2. **Inline PGP**: Plain text body containing `-----BEGIN PGP MESSAGE-----` block
   - Legacy format, still widely used
   - May also contain `-----BEGIN PGP SIGNATURE-----` for cleartext signatures

**Decryption flow:**
1. Message body fetched via JMAP (standard flow)
2. Client-side detection: check Content-Type headers or body text for PGP markers
3. If encrypted:
   a. Check if user has a matching private key (by key ID in message)
   b. If no key: show "This message is encrypted" placeholder with explanation
   c. If key found but locked: prompt for passphrase
   d. Decrypt using OpenPGP.js in a Web Worker (non-blocking)
   e. If PGP/MIME: parse decrypted MIME structure, extract body + attachments
   f. If inline: replace PGP block with plaintext
   g. Render decrypted content in reading pane
4. Decrypted content is never cached on disk (in-memory only via TanStack Query cache)

**Signature verification flow:**
1. Check for signature: PGP/MIME `multipart/signed` or inline `-----BEGIN PGP SIGNATURE-----`
2. Look up signer's public key (from key cache or WKD/keyserver)
3. Verify signature using OpenPGP.js
4. Display verification status:
   - **Valid + Trusted**: Green shield icon — "Signed by alice@example.com (verified)"
   - **Valid + Unknown**: Yellow shield — "Signed by alice@example.com (key not verified)"
   - **Invalid**: Red shield — "Signature verification failed — message may have been tampered with"
   - **No key**: Gray shield — "Signed, but signer's key not found"

**UI indicators:**
```
+----------------------------------------------------------+
| From: Alice Johnson <alice@example.com>                   |
| To: You                                                   |
| Date: Mar 14, 2026                                       |
| 🔒 Encrypted  🛡️ Signed by alice@example.com (verified) |
+----------------------------------------------------------+
| Decrypted message content here...                         |
+----------------------------------------------------------+
```

- Lock icon (🔒) for encrypted messages — green if successfully decrypted
- Shield icon for signed messages — color indicates verification status
- Click icons for detailed crypto info (algorithm, key fingerprint, trust level)

**Acceptance Criteria:**
- [ ] PGP/MIME encrypted messages detected and decrypted
- [ ] Inline PGP encrypted messages detected and decrypted
- [ ] Decryption runs in Web Worker (no UI blocking)
- [ ] Missing private key shows clear explanation (not error)
- [ ] Passphrase prompt appears if key is locked
- [ ] PGP/MIME attachments extracted after decryption
- [ ] Signature verification with 4-tier status (valid+trusted, valid+unknown, invalid, no key)
- [ ] Verification status icons in message header
- [ ] Click verification icon shows detailed crypto info
- [ ] Decrypted content never written to localStorage or IndexedDB
- [ ] Performance: decrypt + verify completes in <500ms for typical emails

### 7.3 — Encrypt & Sign Outgoing Messages

Encrypt and/or sign composed messages before sending.

**Compose integration:**
- When PGP is configured, compose toolbar shows encryption controls:
  ```
  [🔒 Encrypt] [🛡️ Sign] [From: alice@example.com v]
  ```
- Encrypt toggle: On = encrypt to all recipients (requires public keys for all)
- Sign toggle: On = sign with sender's private key
- Default state configurable in settings (default: sign=on, encrypt=off)

**Encryption flow (on send):**
1. Resolve public keys for all recipients (To + Cc + Bcc):
   a. Check local key cache
   b. If missing: auto-lookup via WKD → keys.openpgp.org
   c. If still missing: show dialog listing recipients without keys
   d. Options: "Send unencrypted to those recipients" / "Remove them" / "Cancel"
2. Encrypt plaintext body using recipients' public keys + sender's public key (so sender can read sent copy)
3. If signing: sign the message with sender's private key (may prompt passphrase)
4. Wrap as PGP/MIME `multipart/encrypted`
5. Submit via JMAP — the proxy only sees the encrypted MIME

**Signing flow (on send):**
1. If sign-only (no encryption): create cleartext signature (PGP/MIME `multipart/signed`)
2. If sign + encrypt: sign first, then encrypt (sign-then-encrypt)
3. Passphrase prompt if key is locked

**Key missing UX:**
```
+----------------------------------------------------------+
| Cannot encrypt to all recipients                          |
+----------------------------------------------------------+
| The following recipients do not have a PGP public key:   |
|                                                          |
|   ⚠ bob@external.com                                    |
|   ⚠ carol@other.com                                     |
|                                                          |
| [Search keyservers]  [Send unencrypted]  [Cancel]        |
+----------------------------------------------------------+
```

**Acceptance Criteria:**
- [ ] Encrypt toggle in compose toolbar (visible only when PGP key is configured)
- [ ] Sign toggle in compose toolbar
- [ ] Encryption resolves all recipient public keys before sending
- [ ] Missing key dialog with clear options
- [ ] Auto-lookup via WKD and keyserver for missing keys
- [ ] Encrypted message is valid PGP/MIME readable by GPG, Thunderbird, etc.
- [ ] Signed message has valid signature verifiable by any OpenPGP implementation
- [ ] Sender can read their own sent encrypted messages (encrypted to self)
- [ ] Encryption + signing runs in Web Worker (non-blocking)
- [ ] Send button disabled while crypto operation is in progress (with spinner)

### 7.4 — Key Trust & Verification

Trust model for public keys.

**Trust levels:**
1. **Unknown**: Key found via keyserver or WKD, not manually verified
2. **Verified**: User has explicitly confirmed the key fingerprint (e.g., in-person, phone, separate channel)

**Verification flow:**
```
Contact detail → PGP Key section:

Public Key: 6F2C 8B1D A4E3 ...  (Curve25519, expires 2028-03-14)
Trust: ⚠ Unknown

[Verify this key]  →  Shows full fingerprint comparison dialog:

"Ask Alice to read their key fingerprint. Compare it with:"
6F2C 8B1D A4E3 7890 1234 5678 9ABC DEF0
1234 5678 9ABC DEF0 1234 5678 9ABC DEF0

[Mark as Verified]  [Cancel]
```

**Key updates:**
- Periodically re-fetch public keys from WKD/keyserver (weekly)
- If key changed: notify user, mark as "Updated — re-verify"
- If key expired: show warning in compose, suggest searching for new key
- If key revoked: show warning, remove from encryption candidates

**Acceptance Criteria:**
- [ ] Two trust levels: Unknown and Verified
- [ ] Verification flow with fingerprint comparison
- [ ] Trust level shown in contact detail and compose recipient chips
- [ ] Key update detection with notification
- [ ] Expired/revoked key warnings
- [ ] Trust data stored in webmail DB (in `user_preferences.preferences` JSONB, roams across devices)

### 7.5 — PGP Settings UI

Settings → PGP section:

```
+----------------------------------------------------------+
| PGP Encryption                                           |
+----------------------------------------------------------+
| Your Keys:                                               |
| ┌────────────────────────────────────────────────────┐   |
| │ alice@example.com                                  │   |
| │ 6F2C 8B1D A4E3 7890 ...  (Curve25519)             │   |
| │ Created: Mar 14, 2024  Expires: Mar 14, 2026       │   |
| │ [Export Public] [Export Private] [Revoke] [Delete]  │   |
| └────────────────────────────────────────────────────┘   |
|                                                          |
| [Generate New Key]  [Import Key]                         |
|                                                          |
| Defaults:                                                |
| Sign outgoing messages:    [Always v]  (Always/Ask/Never)|
| Encrypt when possible:     [Ask    v]  (Always/Ask/Never)|
| Auto-lookup public keys:   [x] WKD    [x] keys.openpgp  |
|                                                          |
| Publish your public key:                                 |
| [Upload to keys.openpgp.org]                             |
+----------------------------------------------------------+
```

**Key publishing:**
- Upload public key to keys.openpgp.org (with email verification)
- WKD publishing requires server-side support (future — needs hosting platform integration)

**Acceptance Criteria:**
- [ ] Key list shows all stored keys with fingerprint and expiry
- [ ] Generate, import, export, revoke, delete actions all functional
- [ ] Default sign/encrypt preferences persist
- [ ] Auto-lookup toggle controls WKD and keyserver queries
- [ ] Publish to keys.openpgp.org works (triggers their email verification flow)

### 7.6 — WKD Integration (Web Key Directory)

Automatic key discovery for recipients using the WKD protocol.

**How WKD works:**
1. For recipient `alice@example.com`, construct URL:
   `https://openpgpkey.example.com/.well-known/openpgpkey/example.com/hu/{hash}?l=alice`
   (where `{hash}` is SHA-1 of lowercase local part, z-base-32 encoded)
2. Alternatively, direct method:
   `https://example.com/.well-known/openpgpkey/hu/{hash}?l=alice`
3. Fetch binary public key from URL
4. Import into local key cache

**Implementation:**
- WKD lookup runs client-side (CORS may require backend proxy for some domains)
- Backend provides `/api/wkd/lookup?email=alice@example.com` proxy endpoint
- Results cached in IndexedDB with 7-day TTL
- Lookup triggered when adding recipient to compose To/Cc/Bcc

**Acceptance Criteria:**
- [ ] WKD lookup resolves public keys automatically
- [ ] Both advanced and direct WKD methods attempted
- [ ] Backend proxy handles CORS issues
- [ ] Results cached with 7-day TTL
- [ ] Failed lookups cached briefly (1 hour) to avoid repeated failures
- [ ] Lookup happens asynchronously while composing (non-blocking)

### 7.7 — WKD & Platform-Wide Key Discovery

PGP public keys are stored in the webmail's own DB (`user_preferences.pgp_public_key`).
This enables two features no competitor offers out of the box:

**1. WKD Hosting (Web Key Directory)**

The hosting platform serves users' public keys via the standard WKD protocol, making
them discoverable worldwide by GPG, Thunderbird, ProtonMail, etc.

- Public keys stored in the webmail DB, synced to the hosting platform for WKD serving
  (see `12-hosting-platform-changes.md` section 4 for the sync mechanism)
- Hosting platform serves `/.well-known/openpgpkey/` on each domain's nginx config
- Keys served as binary at `/.well-known/openpgpkey/hu/{hash}`

**2. Platform-Wide Key Discovery**

When composing to another user on the same hosting platform:
- Webmail queries its own DB for the recipient's public key (`GET /api/pgp/lookup?email=...`)
- If found → encryption is seamless (no WKD/keyserver round-trip needed)
- If not found → falls back to WKD, then keys.openpgp.org
- Between platform users, PGP encryption is practically zero-config

**3. Automatic Publishing**

- After key generation, public key is automatically saved to webmail DB (`PUT /api/pgp/key`)
- Webmail DB sync triggers WKD update on the hosting platform
- User is told: "Your public key has been published. Anyone can now send you encrypted email."
- Optional: one-click upload to keys.openpgp.org for broader discovery

**Acceptance Criteria:**
- [ ] Public key stored in webmail DB on generation/import
- [ ] WKD directory served by hosting platform nginx (see `12-hosting-platform-changes.md`)
- [ ] Platform-wide key lookup queries webmail DB directly
- [ ] Key generation auto-publishes (no extra user action needed)
- [ ] WKD responses conform to spec (correct Content-Type, binary format)
- [ ] Key removal triggers WKD cleanup on next convergence

## Security Considerations

### Private Key Protection
- Private keys encrypted at rest in IndexedDB (PBKDF2 + AES-256-GCM)
- Passphrase never stored — prompted once per session
- Session key (derived from passphrase) stored only in JavaScript memory
- On logout: session key cleared from memory
- On tab close: session key may persist (browser retains JS heap) — acceptable trade-off
- **CSP prevents exfiltration**: No inline scripts, no external script sources

### Decrypted Content Protection
- Decrypted message content exists only in JavaScript memory and DOM
- Never written to localStorage, IndexedDB, or sent to the backend
- TanStack Query cache (in-memory) may hold decrypted content — cleared on logout
- Browser's back-forward cache may retain rendered page — mitigated by `Cache-Control: no-store` on SPA

### Threat Mitigations
- **Server compromise**: Attacker can serve malicious JavaScript. Mitigation: SRI (Subresource Integrity) on script tags, CSP to prevent injection. For high-security users, consider browser extension that validates JavaScript hash.
- **XSS**: Could steal decrypted content. Mitigation: strict CSP, DOMPurify, no eval, no inline scripts.
- **Keylogger**: Could capture passphrase. Out of scope (requires endpoint security).

### Limitations (documented for users)
- PGP in a browser is inherently less secure than PGP in a native app (the server serves the code)
- Subject lines are never encrypted (SMTP limitation)
- Metadata (who you email, when) is not protected by PGP
- For maximum security, use GPG with a desktop client

## Performance Notes

- **Web Worker**: All crypto operations run in a dedicated Web Worker
  - Key generation: can take 2-5 seconds for RSA 4096 (show progress indicator)
  - ECC key generation: <1 second
  - Encrypt/sign typical email: <200ms
  - Decrypt/verify typical email: <200ms
- **Large messages**: For emails >1MB, show progress indicator during decrypt
- **Key lookup**: WKD/keyserver lookups are async and non-blocking
- **OpenPGP.js bundle**: ~200KB gzipped — lazy-loaded only when PGP features are used
