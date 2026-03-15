# Phase 9b — Desktop App Distribution

## Goal

Ship seamless, trustworthy desktop app distribution for Windows and macOS with automatic updates, code signing, and a frictionless install experience. Users should never have to manually download an update or dismiss a security warning.

## Distribution Channels

### macOS

| Channel | Pros | Cons |
|---------|------|------|
| **Direct download (.dmg)** | Full control, no review process, instant releases | Requires notarization, users must trust the developer |
| Mac App Store | Discovery, trust, automatic updates via OS | Sandbox restrictions, 30% cut, review delays, limited system tray |
| Homebrew Cask | Developer-friendly, scriptable install | Niche audience, requires maintainer approval |

**Recommendation: Direct .dmg download + Homebrew Cask.** The Mac App Store sandbox restrictions conflict with sidecar process management and localhost networking. Direct distribution with notarization provides the same trust signal without the constraints.

### Windows

| Channel | Pros | Cons |
|---------|------|------|
| **Direct download (.msi/.exe)** | Full control, instant releases | SmartScreen warnings until reputation builds |
| Microsoft Store (MSIX) | Trust, discovery, auto-updates | Review process, packaging overhead, 15% cut |
| Winget | Developer-friendly, CLI install | Requires manifest submission |
| Chocolatey | Popular package manager | Community-maintained, lag on updates |

**Recommendation: Direct .msi download + Winget manifest.** The NSIS installer handles WebView2 bootstrapping and gives full control. Winget submission is low-effort and reaches power users. Microsoft Store can be added later if demand warrants it.

## Code Signing

Code signing is non-negotiable. Unsigned apps trigger scary OS warnings that destroy user trust.

### macOS

| Item | Detail |
|------|--------|
| Certificate | Apple Developer ID Application + Developer ID Installer |
| Cost | $99/year (Apple Developer Program) |
| Signing | `codesign --deep --force --verify --verbose --sign "Developer ID Application: {name}" target/release/bundle/macos/*.app` |
| Notarization | Submit to Apple's notary service via `xcrun notarytool` |
| Stapling | Staple notarization ticket to .dmg: `xcrun stapler staple *.dmg` |
| Result | No Gatekeeper warnings, "identified developer" trust |

### Windows

| Item | Detail |
|------|--------|
| Certificate | EV Code Signing Certificate (hardware token or cloud HSM) |
| Providers | DigiCert, Sectigo, GlobalSign |
| Cost | $200-500/year (EV); standard OV is cheaper but doesn't bypass SmartScreen immediately |
| Signing | `signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a *.exe *.msi` |
| SmartScreen | EV cert provides immediate SmartScreen reputation; OV cert requires download volume to build reputation |
| Result | No SmartScreen warnings, "verified publisher" in UAC prompt |

**Recommendation: EV certificate for Windows.** The immediate SmartScreen bypass is worth the higher cost. A standard OV cert means your first users see "Windows protected your PC" — a terrible first impression.

### CI Secret Management

| Secret | Storage |
|--------|---------|
| Apple signing cert (.p12) | GitHub Actions secret (base64-encoded) |
| Apple cert password | GitHub Actions secret |
| Apple ID + app-specific password | GitHub Actions secret (for notarization) |
| Apple Team ID | GitHub Actions secret |
| Windows EV cert | Cloud HSM (DigiCert KeyLocker, Azure Key Vault, etc.) |
| Windows cert credentials | GitHub Actions secret |

## Auto-Update System

### Architecture

```
Desktop App
  |
  |-- On launch + every 4 hours: check for update
  |-- GET https://releases.example.com/desktop/latest.json
  |
  v
Update Server (static files on CDN)
  |
  ├── latest.json              # Version manifest
  ├── webmail-1.2.0-macos-universal.tar.gz     # macOS update bundle
  ├── webmail-1.2.0-macos-universal.tar.gz.sig # Ed25519 signature
  ├── webmail-1.2.0-windows-x64.msi.zip       # Windows update bundle
  └── webmail-1.2.0-windows-x64.msi.zip.sig   # Ed25519 signature
```

### Update manifest (`latest.json`)

```json
{
  "version": "1.2.0",
  "notes": "New: native notifications for calendar reminders. Fixed: tray icon badge on Windows.",
  "pub_date": "2026-04-01T12:00:00Z",
  "platforms": {
    "darwin-universal": {
      "url": "https://releases.example.com/desktop/webmail-1.2.0-macos-universal.tar.gz",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ..."
    },
    "windows-x86_64": {
      "url": "https://releases.example.com/desktop/webmail-1.2.0-windows-x64.msi.zip",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ..."
    }
  }
}
```

### Tauri Updater Configuration

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.example.com/desktop/latest.json"],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ...",
      "dialog": true
    }
  }
}
```

### Update Flow (User Experience)

1. App checks for update silently in the background
2. If update available: show a non-intrusive toast notification: *"Version 1.2.0 is available — click to update"*
3. User clicks → progress bar appears in the tray area / a small modal
4. Download completes → "Restart to apply update" button
5. User clicks → app restarts with new version
6. If user ignores: reminder appears once on next launch, then silently waits

**No forced updates. No full-screen modals. No "updating, please wait" blocking screens.**

### Update Signing

Tauri's updater uses Ed25519 signatures (not the OS code signing cert). This is a separate keypair:
- Private key: stored in CI secrets, used to sign update bundles during build
- Public key: embedded in the app binary (`tauri.conf.json`), used to verify downloads

This prevents MITM attacks even if the CDN is compromised.

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/desktop-release.yml
name: Desktop Release

on:
  push:
    tags: ['desktop-v*']

jobs:
  build-macos:
    runs-on: macos-latest
    strategy:
      matrix:
        target: [aarch64-apple-darwin, x86_64-apple-darwin]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.25' }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: '${{ matrix.target }}' }

      # Build Go sidecar for target arch
      - run: |
          GOOS=darwin GOARCH=${{ matrix.target == 'aarch64-apple-darwin' && 'arm64' || 'amd64' }} \
          CGO_ENABLED=0 go build -tags embedstatic \
          -o desktop/src-tauri/binaries/webmail-api-${{ matrix.target }} \
          ./cmd/webmail-api

      # Build frontend (shared across archs)
      - run: cd web && npm ci && npm run build

      # Build Tauri app
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: desktop
          args: --target ${{ matrix.target }}
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - uses: actions/upload-artifact@v4
        with:
          name: macos-${{ matrix.target }}
          path: desktop/src-tauri/target/${{ matrix.target }}/release/bundle/

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.25' }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: dtolnay/rust-toolchain@stable

      # Build Go sidecar
      - run: |
          $env:CGO_ENABLED=0
          go build -tags embedstatic `
            -o desktop/src-tauri/binaries/webmail-api-x86_64-pc-windows-msvc.exe `
            ./cmd/webmail-api

      # Build frontend
      - run: cd web && npm ci && npm run build

      # Build Tauri app
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: desktop
        env:
          # Windows EV signing via cloud HSM
          WINDOWS_SIGN_COMMAND: 'signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /sha1 ${{ secrets.WINDOWS_CERT_THUMBPRINT }} "%1"'
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - uses: actions/upload-artifact@v4
        with:
          name: windows-x64
          path: desktop/src-tauri/target/release/bundle/

  create-universal-macos:
    needs: build-macos
    runs-on: macos-latest
    steps:
      # Download both arch builds, create universal binary with lipo,
      # re-sign, notarize, staple, create .dmg

  publish-release:
    needs: [create-universal-macos, build-windows]
    runs-on: ubuntu-latest
    steps:
      # 1. Create GitHub Release with changelog
      # 2. Upload .dmg, .msi, and .exe as release assets
      # 3. Upload update bundles (.tar.gz, .msi.zip) + signatures to CDN
      # 4. Update latest.json on CDN
      # 5. Update Homebrew Cask formula
      # 6. Update Winget manifest
```

### Release Process

1. Bump version in `desktop/src-tauri/tauri.conf.json`
2. Write changelog entry
3. Tag: `git tag desktop-v1.2.0 && git push --tags`
4. CI builds, signs, notarizes, and publishes automatically
5. Users get the update notification within 4 hours

## Download Page & Website

### Landing page requirements

- Clean, fast page at `example.com/desktop` or `download.example.com`
- Auto-detect OS and show the right download button prominently
- Show the other platform as a secondary link
- Display current version number and "What's new" link
- System requirements clearly listed
- Screenshot of the app

### Download experience

| Step | macOS | Windows |
|------|-------|---------|
| 1 | Download `.dmg` (30-40MB) | Download `.msi` (35-45MB) |
| 2 | Open .dmg, drag to Applications | Run installer, Next → Next → Finish |
| 3 | First launch: "App is from identified developer" → Open | First launch: no warnings (EV cert) |
| 4 | Done — app appears in dock | Done — app appears in Start menu + taskbar |

No registration, no account creation, no email collection before download. The app itself handles login.

## Update Infrastructure

### Option A: GitHub Releases as CDN (Simplest)

- Tauri's updater can point directly at GitHub Releases
- `latest.json` is generated by the CI workflow and uploaded as a release asset
- GitHub's CDN handles downloads globally
- Free for public repos; included in GitHub plan for private repos
- **Recommended for initial launch**

### Option B: Dedicated CDN (Scalable)

- Upload artifacts to S3/R2/GCS behind CloudFlare
- More control over analytics, download counts, geographic distribution
- Can add download tracking, A/B test landing pages
- **Migrate to this when download volume justifies it**

## Versioning Strategy

- Desktop app version is independent of the web app version
- Format: `desktop-v{major}.{minor}.{patch}` (e.g., `desktop-v1.0.0`)
- The Go sidecar binary is the same build as the web deployment — its version is embedded at build time
- Changelog maintained in `desktop/CHANGELOG.md`

## Telemetry & Crash Reporting (Optional)

| Tool | Purpose |
|------|---------|
| Sentry | Crash reporting (Rust panics + JS errors) |
| PostHog / Plausible | Anonymous usage analytics (opt-in) |

Both are optional and should be opt-in with a clear privacy notice on first launch. Not required for v1.

## Cost Summary

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer Program | $99 | Annual |
| Windows EV Code Signing (DigiCert) | ~$400 | Annual |
| GitHub Actions (CI minutes) | ~$0-50/month | Per release |
| CDN (GitHub Releases) | $0 | Included |
| **Total** | **~$550/year** | |

## Implementation Order

| Step | Task | Depends on |
|------|------|-----------|
| 1 | Purchase Apple Developer + Windows EV cert | — |
| 2 | Set up CI secrets for signing | Step 1 |
| 3 | Create GitHub Actions workflow (macOS + Windows) | Plan 15 complete |
| 4 | Auto-update integration (`tauri-plugin-updater`) | Step 3 |
| 5 | `latest.json` generation in CI | Step 4 |
| 6 | Test full update cycle on both platforms | Step 5 |
| 7 | Build download landing page | — |
| 8 | Submit Homebrew Cask formula | Step 3 |
| 9 | Submit Winget manifest | Step 3 |
| 10 | Write install/update docs | Step 7 |

**Total estimate: 2-3 working days** (assuming plan 15 is already complete and certificates are purchased).

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Apple notarization rejects binary | Blocks macOS release | Run notarization in CI on every PR; catch issues before tagging |
| Windows SmartScreen with OV cert | Users see "unknown publisher" | Use EV cert from day one; worth the cost |
| CDN outage blocks auto-update | Users stuck on old version | Fallback: manual download from GitHub Releases page |
| Signing key compromise | Attacker can push malicious updates | Keys in GitHub Actions secrets (encrypted at rest); rotate annually; Ed25519 update signing is separate from OS signing |
| Large update downloads | Users on slow connections | Delta updates (Tauri v2 supports this); keep bundle size lean |
| Certificate expiry | Builds fail silently | CI alerts when cert expires within 30 days |
