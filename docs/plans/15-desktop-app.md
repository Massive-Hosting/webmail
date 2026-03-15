# Phase 9 — Desktop App (Tauri)

## Goal

Ship the webmail as a native desktop application on Windows and macOS using Tauri, providing a stellar experience that feels like a first-class mail client — not a browser tab. System tray, native notifications, `mailto:` handling, badge counts, auto-update, and fast cold start.

## Architecture

```
+----------------------------------------------+
|           Tauri Shell (Rust)                  |
|  +----------------------------------------+  |
|  |  Native webview                        |  |
|  |  (WebKit on macOS, WebView2 on Win)    |  |
|  |                                        |  |
|  |  Loads: http://127.0.0.1:{port}        |  |
|  +----------------------------------------+  |
|                                              |
|  Sidecar: webmail-api binary (Go)            |
|  - Spawned on app launch                     |
|  - Listens on random localhost port          |
|  - Embedded SPA + full API server            |
|  - Killed on app close                       |
+----------------------------------------------+
```

The Go binary is the same production binary, unchanged. Tauri wraps it as a sidecar and opens a webview pointed at it. This means:
- Zero code changes to the web app or Go backend
- Desktop and web share the exact same codebase
- The Tauri layer is thin — only native OS integration glue

## Sidecar Management

### Startup sequence

1. Tauri app launches
2. Rust `setup()` hook picks a free TCP port
3. Spawns the Go sidecar with `PORT={port}` env var
4. Polls `http://127.0.0.1:{port}/api/health` until ready (timeout 10s)
5. Creates the main webview window pointing at `http://127.0.0.1:{port}`
6. Shows the window (hidden until ready — no white flash)

### Shutdown

1. User closes the window (or quits from tray)
2. Tauri `on_exit` hook sends SIGTERM to the Go process
3. Go binary shuts down gracefully (closes DB connections, WebSocket hub)
4. Tauri process exits

### Crash recovery

- If the Go process crashes, Tauri detects the port is dead and shows an error screen with a "Restart" button
- On restart, the sidecar is re-spawned and the webview reloads

## Feature Breakdown

### 1. System Tray

| Feature | Detail |
|---------|--------|
| Tray icon | App icon with unread badge overlay (number or dot) |
| Tray menu | Inbox, Compose, Check for updates, Quit |
| Click action | macOS: single-click opens app; Windows: single-click opens app |
| Close behavior | Closing the window hides to tray (configurable: quit or minimize) |
| Badge count | Updated via WebSocket — the Tauri Rust layer listens on a localhost endpoint or IPC channel for unread count changes |

**Implementation:** The Go backend already has a WebSocket that pushes state changes. Add a lightweight `/api/unread-count` endpoint (or include it in the existing WebSocket protocol). The Tauri Rust side connects to this and updates the tray icon badge.

### 2. Native Notifications

| Feature | Detail |
|---------|--------|
| New mail | Show sender, subject, preview snippet |
| Click action | Opens the app and navigates to that message |
| Grouping | Group by thread on macOS (UNNotificationContent) |
| Do Not Disturb | Respect OS DND settings (automatic via native API) |
| Preferences | Honor existing notification settings from the web app |
| Sounds | Use the OS default notification sound |

**Implementation:**
- The existing web app already has notification settings (enabled/disabled, per-mailbox rules)
- Replace the browser Notification API with Tauri's `tauri-plugin-notification`
- Wire the WebSocket's new-mail events through to native notifications
- Include a `deep_link` payload so clicking a notification routes to the right message
- Bridge: add a small JS shim that detects Tauri context (`window.__TAURI__`) and routes notification calls to the native API instead of the browser API

### 3. `mailto:` Protocol Handler

| Feature | Detail |
|---------|--------|
| Registration | Register as default `mailto:` handler on install |
| Handling | Parse `mailto:` URI → open compose window with pre-filled fields |
| Deep link | `mailto:user@example.com?subject=Hello&body=Hi` |
| macOS | Register via `Info.plist` CFBundleURLTypes |
| Windows | Register via registry during NSIS install |

**Implementation:**
- Use `tauri-plugin-deep-link` to register and handle `mailto:` URIs
- On activation, parse the URI and inject it into the webview via `window.__TAURI__.event.emit('mailto', parsed)`
- The React app listens for this event and opens the compose dialog with pre-filled fields

### 4. Auto-Launch on Login

| Feature | Detail |
|---------|--------|
| macOS | Login item via `tauri-plugin-autostart` |
| Windows | Start menu startup folder or registry Run key |
| Default | Disabled — user can enable in Settings → General |
| Behavior | Launches minimized to tray |

### 5. Global Keyboard Shortcut

| Feature | Detail |
|---------|--------|
| Shortcut | `Ctrl+Shift+M` (configurable) to toggle app visibility |
| New mail | `Ctrl+Shift+N` to open compose from anywhere |
| Implementation | `tauri-plugin-global-shortcut` |

### 6. Window State Persistence

| Feature | Detail |
|---------|--------|
| Saved | Window position, size, maximized state |
| Storage | `tauri-plugin-window-state` (stores in app data dir) |
| Multi-monitor | Remembers which monitor the window was on |
| Restore | On launch, restore to previous position/size |

### 7. File Handling

| Feature | Detail |
|---------|--------|
| Drag-drop attachments | Works out of the box (webview supports it) |
| Save attachments | Native file dialog via `tauri-plugin-dialog` |
| Open attachments | Open with OS default app after download |
| Drag out | Drag attachment from message to desktop/folder |

### 8. Offline Indicator

The web app already handles offline gracefully (TanStack Query cache). In the desktop app:
- Show a subtle banner when the Go sidecar can't reach the mail server
- Tray icon changes to a greyed-out variant when offline

## Project Structure

```
~/projects/webmail/
  desktop/                          # New — Tauri project
    src-tauri/
      Cargo.toml                    # Rust dependencies
      tauri.conf.json               # App metadata, window config, sidecar config
      capabilities/                 # Permission capabilities
        default.json
      src/
        main.rs                     # Tauri entry point — thin
        lib.rs                      # Setup, sidecar management, IPC commands
        tray.rs                     # System tray setup and event handling
        notifications.rs            # Native notification bridge
        deep_link.rs                # mailto: handler
        updater.rs                  # Auto-update configuration
      icons/                        # App icons (all sizes, both platforms)
      binaries/                     # Go sidecar binaries (placed here by build script)
        webmail-api-x86_64-apple-darwin
        webmail-api-aarch64-apple-darwin
        webmail-api-x86_64-pc-windows-msvc.exe
    src/                            # Tauri-specific JS bridge (minimal)
      tauri-bridge.ts               # Detects Tauri, shims notifications, deep links
    build.sh                        # Cross-compile Go binary + bundle into Tauri
    package.json                    # Tauri CLI as devDependency
```

## Tauri-Specific Frontend Changes

Minimal. The goal is to keep the web app working identically in browser and desktop.

### Detection shim (`tauri-bridge.ts`)

```typescript
export const isTauri = () => '__TAURI__' in window;

// Override notification API when running in Tauri
if (isTauri()) {
  // Route to native notifications via tauri-plugin-notification
  // Listen for mailto: deep links and dispatch to compose store
  // Listen for tray "compose" action
}
```

This shim is loaded in `main.tsx` and sets up event listeners. No `if (isTauri)` checks scattered through the codebase — the shim handles everything in one place.

### Changes to existing code

| File | Change |
|------|--------|
| `main.tsx` | Import `tauri-bridge.ts` (no-op in browser) |
| `notification-settings.tsx` | Show "Native notifications" label when in Tauri |
| `general-settings.tsx` | Show "Launch on login" toggle when in Tauri |
| `general-settings.tsx` | Show "Close to tray" toggle when in Tauri |

That's it. Everything else works as-is.

## Build Pipeline

### Local development (Linux)

All Tauri Rust code, the bridge shim, and sidecar management are developed on Linux. No Mac or Windows machine needed for writing code.

```bash
# Terminal 1: Go backend (as usual)
just dev

# Terminal 2: Vite dev server (as usual)
cd web && npm run dev

# Terminal 3: Tauri dev mode (uses Vite dev server URL)
cd desktop && cargo tauri dev
```

Tauri dev mode points the webview at `http://localhost:5173` (Vite), which proxies API calls to the Go backend. Hot reload works for both frontend and Tauri Rust code.

### Production builds via CI (no local Mac/Windows needed)

The webmail repo is **public on GitHub**, which means **unlimited free CI minutes** on macOS and Windows runners. All production builds — including code signing, Apple notarization, and installer packaging — happen entirely in CI. You never need to touch a Mac or Windows machine.

```
git tag desktop-v1.0.0 && git push --tags
  → GitHub Actions triggers
  → macOS runner: builds Go (arm64 + amd64), builds Tauri, signs, notarizes, staples, creates .dmg
  → Windows runner: builds Go (amd64), builds Tauri, signs with EV cert, creates .msi
  → Linux runner: creates GitHub Release, uploads artifacts, updates latest.json
  → Done. Signed, notarized binaries available for download.
```

No local cross-compilation. Each platform builds natively on its own runner. See `16-desktop-distribution.md` for the full CI workflow.

Output:
- macOS: `.dmg` installer + `.app` bundle (universal binary, signed + notarized)
- Windows: `.msi` installer (NSIS, EV-signed) + portable `.exe`

## Tauri Plugins Used

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-notification` | Native OS notifications |
| `tauri-plugin-deep-link` | `mailto:` protocol handling |
| `tauri-plugin-autostart` | Launch on login |
| `tauri-plugin-global-shortcut` | System-wide hotkeys |
| `tauri-plugin-window-state` | Remember window position/size |
| `tauri-plugin-dialog` | Native file save/open dialogs |
| `tauri-plugin-updater` | Auto-update (see distribution plan) |
| `tauri-plugin-shell` | Sidecar process management |
| `tauri-plugin-single-instance` | Prevent multiple instances |

## Platform-Specific Notes

### macOS

- Minimum: macOS 11 (Big Sur) — WebKit requirement
- Universal binary: build for both `x86_64` and `aarch64`, combine with `lipo`
- Notarization required for distribution outside App Store
- System tray: use `NSStatusItem` (Tauri handles this)
- Dock badge: show unread count on dock icon via `NSApplication.setBadgeCount()`

### Windows

- Minimum: Windows 10 1803+ (WebView2 requirement)
- WebView2 runtime: bundled with Windows 11; for Windows 10, the installer bootstraps it
- System tray: standard `NOTIFYICONDATA` (Tauri handles this)
- Taskbar badge: flash taskbar icon on new mail, overlay badge icon

## Implementation Order

| Step | Task | Effort |
|------|------|--------|
| 1 | Scaffold Tauri project, configure sidecar | 2-3 hours |
| 2 | Sidecar lifecycle (spawn, health check, shutdown) | 3-4 hours |
| 3 | System tray with unread badge | 3-4 hours |
| 4 | Native notifications (bridge + WebSocket integration) | 4-6 hours |
| 5 | `mailto:` deep link handler | 2-3 hours |
| 6 | Window state persistence | 1 hour |
| 7 | Auto-launch on login | 1 hour |
| 8 | Global keyboard shortcuts | 1-2 hours |
| 9 | Single instance enforcement | 30 min |
| 10 | App icons and branding | 2-3 hours |
| 11 | CI/CD pipeline (see distribution plan) | 1-2 days |
| 12 | Code signing + notarization | 1 day |
| 13 | Auto-update integration | 3-4 hours |
| 14 | Testing on both platforms | 1-2 days |

**Total estimate: ~5-7 working days** for a polished, production-ready desktop app.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| WebView2 not installed on Windows 10 | NSIS installer bootstraps WebView2 runtime automatically |
| Go sidecar binary size (~15-25MB) | Acceptable. Total app size ~30-40MB with Tauri shell — still far smaller than Electron |
| macOS notarization failures | CI runs notarization as part of build; catch issues early |
| WebSocket behavior in webview | Same engine as browser; no known issues |
| IndexedDB (PGP keys) persistence | Webview data dir is persistent; same behavior as browser |
| Sidecar port conflicts | Random port selection with retry; health check confirms availability |
