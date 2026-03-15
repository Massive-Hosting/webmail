# Desktop App Code Signing & Notarization

The CI pipeline builds and bundles the desktop app for macOS, Windows, and Linux.
Signing is **optional** — when secrets are missing, builds are produced unsigned.
This is fine for testing but unsigned apps trigger OS security warnings for end users.

## Quick Start (No Signing)

1. Push a tag or use workflow_dispatch:
   ```bash
   git tag desktop-v0.1.0 && git push --tags
   ```
2. CI builds unsigned `.dmg`, `.msi`/`.exe`, `.deb`, `.rpm`, `.AppImage`
3. Download artifacts from the GitHub Actions run or the auto-created Release

## Tauri Update Signing (Ed25519)

Separate from OS code signing. Required for the auto-updater to verify downloads.
Without this, the updater won't work but the app builds fine.

### Generate the keypair

```bash
cargo tauri signer generate -w ~/.tauri/webmail.key
```

This creates:
- `~/.tauri/webmail.key` — private key (keep secret)
- `~/.tauri/webmail.key.pub` — public key (embed in app)

### Configure

1. Add the **public key** to `desktop/src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ..."
     }
   }
   ```

2. Add these **GitHub Actions secrets**:
   | Secret | Value |
   |--------|-------|
   | `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/webmail.key` |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you chose during generation |

## macOS Code Signing & Notarization

### Prerequisites

- Apple Developer Program membership ($99/year) — https://developer.apple.com/programs/
- A **Developer ID Application** certificate
- A **Developer ID Installer** certificate (for .pkg, optional)

### Step 1: Create certificates

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click **+** → choose **Developer ID Application** → follow the CSR process
3. Download the `.cer` file and import into Keychain Access
4. Export as `.p12` from Keychain Access (right-click → Export)

### Step 2: Create an app-specific password

1. Go to https://appleid.apple.com/account/manage
2. Under **Sign-In and Security** → **App-Specific Passwords** → **Generate**
3. Name it "Webmail CI Notarization"
4. Save the generated password

### Step 3: Find your Team ID

1. Go to https://developer.apple.com/account/#/membership
2. Copy the **Team ID** (10-character string)

### Step 4: Add GitHub Actions secrets

| Secret | Value | How to get it |
|--------|-------|---------------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 file | `base64 -i certificate.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 | Set during export from Keychain |
| `APPLE_SIGNING_IDENTITY` | Certificate common name | e.g., `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Your Apple ID email | The email for your Apple Developer account |
| `APPLE_PASSWORD` | App-specific password | Generated in Step 2 above |
| `APPLE_TEAM_ID` | Team ID | From Step 3 above |

### What happens in CI

1. `tauri-action` imports the .p12 certificate into a temporary keychain
2. Builds the `.app` bundle
3. Signs with `codesign --deep --force` using the Developer ID certificate
4. Submits to Apple's notary service via `xcrun notarytool submit`
5. Waits for notarization approval (usually 1-5 minutes)
6. Staples the notarization ticket to the `.app` and `.dmg`
7. Result: no Gatekeeper warnings, users see "identified developer"

## Windows EV Code Signing

### Prerequisites

- EV Code Signing Certificate from DigiCert, Sectigo, or GlobalSign (~$400/year)
- Cloud HSM access (e.g., DigiCert KeyLocker, Azure Key Vault) — **required for CI**
  - Traditional EV certs use USB hardware tokens, which can't plug into CI runners
  - Cloud HSM provides the same EV trust level without physical hardware

### Recommended: DigiCert KeyLocker

1. Purchase an EV Code Signing certificate from DigiCert
2. Choose the **KeyLocker** option for cloud-based signing
3. DigiCert provides:
   - A certificate thumbprint
   - API credentials for `signtool` via their cloud HSM
   - Client tools to configure `signtool` for cloud signing

### Step 1: Set up DigiCert KeyLocker in CI

Follow DigiCert's guide to configure `signtool` with their cloud HSM:
https://docs.digicert.com/en/digicert-keylocker.html

The CI runner needs:
- `smctl` (DigiCert's signing manager CLI) — installed via a setup step
- Environment variables for authentication

### Step 2: Add GitHub Actions secrets

| Secret | Value | How to get it |
|--------|-------|---------------|
| `WINDOWS_CERT_THUMBPRINT` | SHA1 thumbprint of the EV cert | DigiCert dashboard |

Additional secrets may be needed depending on your HSM provider:
| Secret | Value |
|--------|-------|
| `SM_API_KEY` | DigiCert KeyLocker API key |
| `SM_CLIENT_CERT_FILE` | Base64-encoded client auth certificate |
| `SM_CLIENT_CERT_PASSWORD` | Client cert password |
| `SM_HOST` | KeyLocker host URL |

### What happens in CI

1. `signtool sign` is invoked via the `WINDOWS_SIGN_COMMAND` env var
2. Signs the `.exe` and `.msi` with SHA-256 + RFC 3161 timestamp
3. EV certificate provides **immediate SmartScreen reputation** — no warnings
4. Users see "Verified publisher: Your Name" in the UAC prompt

### Alternative: OV Certificate (Cheaper, Worse UX)

- Standard OV certs (~$100/year) work but don't bypass SmartScreen immediately
- First users see "Windows protected your PC" — builds trust over download volume
- Not recommended for a new app; fine for internal/dev use

## GitHub Secrets Setup

Go to: **Repository → Settings → Secrets and variables → Actions → New repository secret**

### Minimum (builds work, no signing):
No secrets needed.

### For auto-updater only:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### For full macOS signing + notarization:
- All of the above, plus:
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

### For full Windows EV signing:
- All of the above, plus:
- `WINDOWS_CERT_THUMBPRINT`
- Any HSM provider secrets (e.g., `SM_API_KEY`, etc.)

## Cost Summary

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer Program | $99 | Annual |
| Windows EV Code Signing (DigiCert) | ~$400 | Annual |
| GitHub Actions CI | **$0** | Free for public repos |
| GitHub Releases CDN | **$0** | Free for public repos |
| **Total** | **~$500/year** | |
