# Webmail Client — Overview & Architecture

## Vision

A modern, high-performance webmail client that surpasses Outlook Web Access in speed, polish, and user experience. Built as a standalone project (`~/projects/webmail`) that connects to Stalwart mail servers via the JMAP protocol. Supports email, contacts, calendar, and PGP encryption in a unified interface with dark/light theming and fluid animations.

This is an independent project — no code dependency on the hosting platform. It communicates with Stalwart over HTTPS/JMAP and can be deployed alongside the hosting platform or independently. Separate CI, versioning, and release cycles.

## Architecture

```
                          +------------------+
                          |   Browser (SPA)  |
                          |  React 19 + TS   |
                          +--------+---------+
                                   |
                          HTTPS (JSON API)
                                   |
                          +--------+---------+
                          |  Webmail API     |
                          |  Go + Chi        |
                          |  (stateless)     |
                          +--------+---------+
                                   |
                            JMAP over HTTPS
                            (user credentials)
                                   |
                          +--------+---------+
                          |    Stalwart      |
                          |  Mail Server     |
                          +------------------+
```

### Design Principles

1. **Stateless proxy**: The Go backend holds no mail state. All data lives in Stalwart. The backend translates auth (session cookie to Stalwart credentials) and proxies JMAP. This means zero database tables for the webmail itself.

2. **JMAP-native**: The frontend thinks in JMAP concepts (Email, Mailbox, Thread, Identity, EmailSubmission). The backend exposes a thin REST API that maps 1:1 to JMAP method calls, adding auth and tenant isolation.

3. **Optimistic UI**: Every mutation (star, move, delete, mark read) updates the local cache immediately and syncs in the background. Failures roll back with a toast notification.

4. **Offline-resilient**: TanStack Query's cache means previously loaded mailboxes, threads, and messages are available instantly on revisit. Not a full offline client, but network-tolerant.

5. **Security-first**: No direct Stalwart exposure. All requests are authenticated and scoped. HTML email is sanitized. Attachments are streamed through the proxy with content-type validation.

## Tech Stack

### Frontend

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | React | 19 | Component model, matches existing apps |
| Language | TypeScript | 5.x | Type safety, JMAP type definitions |
| Build | Vite | 7.x | Fast dev server, HMR, matches existing apps |
| Routing | TanStack Router | latest | Type-safe routing, already used in controlpanel-admin |
| Data fetching | TanStack Query | latest | Cache, optimistic updates, background refetch |
| Virtualization | TanStack Virtual | latest | Smooth scroll through large mailboxes |
| State | Zustand | latest | UI state (panel sizes, compose drafts, selections) |
| Rich text | Tiptap | latest | ProseMirror-based, extensible, clean HTML output |
| UI primitives | Radix UI | latest | Accessible, unstyled components (matches existing) |
| Styling | Tailwind CSS | 4.x | Utility-first, dark mode via class strategy |
| Icons | Lucide React | latest | Consistent icon set (matches existing) |
| Toasts | Sonner | latest | Notification system (matches existing) |
| Drag & Drop | @dnd-kit | latest | Drag messages between folders |
| Dates | date-fns | latest | Lightweight date formatting |
| Charts | Recharts | latest | Storage usage visualization |

### Backend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | Go 1.26 | Matches existing platform |
| Router | Chi v5 | Matches existing platform |
| Auth | Session cookies + encrypted credential storage | Translates browser session to Stalwart basic auth |
| JMAP | Extended stalwart.JMAPClient | Proxies all JMAP operations |
| Logging | zerolog | Matches existing platform |
| Metrics | Prometheus | Matches existing platform |
| Config | Environment variables | Matches existing platform |

### Infrastructure Footprint

- **Webmail PostgreSQL database** — stores brands/partners (branding), user preferences, PGP public keys. Small, lightweight. Follows the same pattern as the controlpanel's separate DB.
- **Stalwart** — all mail/contact/calendar state lives here via JMAP
- **Valkey** — used for Temporal progress relay to WebSocket hub (existing platform Valkey instance)
- **Temporal** — used for bulk operations (export, import, bulk move/delete, retroactive filters). Connects to the hosting platform's existing Temporal cluster
- **No new storage backends**

### Webmail's Own Database

The webmail has its own PostgreSQL database (like the controlpanel has a separate DB from the core).
This follows the same pattern as the controlpanel and provides:
- Brand/partner configuration (hostname, colors, logo per brand)
- User preferences (roaming settings, moved from core DB `email_accounts` table)
- PGP public keys (moved from core DB — the webmail owns this data)
- Future webmail-specific data without touching the core schema

The webmail DB schema mirrors the controlpanel's branding pattern:
```sql
-- Brand/partner tables (same pattern as controlpanel)
CREATE TABLE brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE partners (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id),
    name TEXT NOT NULL,
    hostname TEXT NOT NULL UNIQUE,  -- e.g. "mail.myhosting.com"
    primary_color TEXT,             -- hex color for UI theming
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User data
CREATE TABLE user_preferences (
    email TEXT PRIMARY KEY,         -- email address as key
    preferences JSONB NOT NULL DEFAULT '{}',
    pgp_public_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Hosting Platform Dependencies

The webmail relies on the hosting platform's core API for:
1. **Stalwart context resolution** — `GET /email-accounts/by-email/{email}/stalwart-context` (which Stalwart instance to talk to)
2. **Temporal cluster** — for bulk async workflows
3. **Valkey** — for WebSocket progress relay

Note: preferences and PGP keys are now stored in the webmail's own DB, NOT the core DB.
This reduces the core API surface needed and keeps the webmail self-contained.

**Auth model — service-to-service:**

Users cannot call the core API directly. The webmail API is an internal service that
authenticates to the core API using a scoped `WEBMAIL_API_KEY` (same pattern as `AGENT_API_KEY`).

```
User (browser)
  → email + password → Webmail API
    → resolves Stalwart URL via Core API (cached for session)
    → validates credentials against Stalwart (basic auth)
    → creates encrypted session cookie

  → subsequent requests → Webmail API
    → session cookie → extracts email + stalwartURL
    → JMAP requests → proxied to Stalwart with user's credentials
    → preferences/PGP → read/written in webmail's own DB (no core API call)
```

Core API endpoints needed (scoped to `WEBMAIL_API_KEY`):
```
GET  /email-accounts/by-email/{email}/stalwart-context  → Stalwart URL + token for this user
```

This is the only core API endpoint the webmail needs at runtime. Called once per login, cached.

## Project Structure

```
~/projects/webmail/
  web/                        # Frontend SPA
    src/
    api/                    # API client functions, JMAP type definitions
      client.ts             # Base HTTP client with auth handling
      mail.ts               # Email/Thread/Mailbox queries and mutations
      contacts.ts           # Contact/ContactGroup operations
      calendar.ts           # CalendarEvent operations
      blob.ts               # Attachment upload/download
      types.ts              # JMAP type definitions (Email, Mailbox, Thread, etc.)
    components/
      layout/               # App shell, three-pane layout, resizable panels
        app-shell.tsx
        sidebar.tsx
        mail-list-pane.tsx
        reading-pane.tsx
        resize-handle.tsx
      mail/                 # Email-specific components
        message-list.tsx    # Virtualized message list
        message-list-item.tsx
        message-view.tsx    # Full message reader
        thread-view.tsx     # Threaded conversation view
        compose/            # Compose window
          compose-dialog.tsx
          editor.tsx        # Tiptap rich text editor
          recipient-input.tsx
          attachment-list.tsx
        folder-tree.tsx     # Mailbox tree with drag-drop
        search-bar.tsx
        toolbar.tsx
      contacts/             # Contact management
        contact-list.tsx
        contact-detail.tsx
        contact-form.tsx
      calendar/             # Calendar views
        month-view.tsx
        week-view.tsx
        day-view.tsx
        event-form.tsx
        agenda-sidebar.tsx
      ui/                   # Shared primitives (extends platform design system)
        button.tsx
        input.tsx
        dropdown.tsx
        dialog.tsx
        tooltip.tsx
        avatar.tsx
        badge.tsx
        skeleton.tsx
        kbd.tsx             # Keyboard shortcut display
        empty-state.tsx
    hooks/
      use-mailboxes.ts      # Mailbox list + unread counts
      use-messages.ts       # Message list with pagination
      use-thread.ts         # Thread expansion
      use-message.ts        # Single message fetch
      use-contacts.ts       # Contact list + search
      use-calendar.ts       # Calendar events
      use-keyboard.ts       # Global keyboard shortcut manager
      use-theme.ts          # Dark/light mode
      use-panel-layout.ts   # Persisted panel sizes
    stores/
      ui-store.ts           # Panel state, active view, selections
      compose-store.ts      # Draft management (multiple concurrent drafts)
      settings-store.ts     # User preferences (theme, density, shortcuts)
    routes/
      __root.tsx            # App shell layout
      mail/
        index.tsx           # Inbox (default)
        $mailboxId.tsx      # Specific mailbox
        $mailboxId.$threadId.tsx  # Thread within mailbox
      contacts/
        index.tsx
        $contactId.tsx
      calendar/
        index.tsx
        $eventId.tsx
      settings/
        index.tsx
    lib/
      jmap.ts               # JMAP request builder helpers
      sanitize.ts           # HTML email sanitizer (DOMPurify wrapper)
      keyboard.ts           # Shortcut registry and handler
      theme.ts              # Theme constants and CSS variable management
      format.ts             # Date, size, address formatting utilities
      search-parser.ts      # Parse structured search queries
      pgp.ts                # OpenPGP.js wrapper for encrypt/decrypt/sign/verify
    types/
      jmap.ts               # Core JMAP types (Request, Response, Invocation)
      mail.ts               # Email, Thread, Mailbox, Identity types
      contacts.ts           # Contact, ContactGroup types
      calendar.ts           # CalendarEvent, Calendar types
  public/
    favicon.svg
  index.html
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json

  cmd/                        # Backend Go binaries
    webmail-api/
      main.go                 # Entry point

  internal/                   # Backend Go packages
    handler/
      auth.go                 # Login, logout, session management
      proxy.go                # JMAP proxy handler
      blob.go                 # Attachment upload/download proxy
      settings.go             # Preferences + PGP key CRUD (own DB)
      websocket.go            # WebSocket handler for real-time updates
      health.go               # Health check endpoints
      partner.go              # Brand/partner info endpoint
    middleware/
      auth.go                 # Session validation middleware
      partner.go              # Partner resolution from hostname (branding)
      ratelimit.go            # Per-user rate limiting
      security.go             # Security headers, CORS, CSP
    session/
      store.go                # Encrypted session store (cookie-based)
      crypto.go               # AES-GCM session encryption
    ws/
      hub.go                  # WebSocket connection hub
      client.go               # Per-connection handler
      eventsource.go          # Stalwart JMAP EventSource subscriber
    db/
      db.go                   # Database connection (webmail's own PostgreSQL)
      queries.go              # SQL queries for preferences, PGP keys, partners
    core/
      partner.go              # Partner/brand service
      preferences.go          # User preferences service
    model/
      partner.go              # Brand, Partner types
      preferences.go          # UserPreferences type
    config/
      config.go               # Webmail configuration
    hosting/
      client.go               # Core API client (stalwart-context resolution)

  migrations/                 # Webmail DB migrations (goose)
    00001_initial_schema.sql  # brands, partners, user_preferences tables

  go.mod
  go.sum
  Dockerfile                  # Multi-stage build (Go API + React SPA)
  docker-compose.yml          # Local development
  justfile                    # Build & deploy tasks
  CLAUDE.md                   # Developer conventions
  docs/
    plans/                    # Implementation plans (this directory)
```

## Deployment

The webmail deploys as a single container (or two if frontend is served separately):

**Option A — Single container (recommended for simplicity):**
- Go binary serves both the API and the static React build
- React `dist/` embedded via `embed.FS` in Go
- Single Dockerfile, single Kubernetes Deployment

**Option B — Separate containers:**
- `webmail-api` — Go binary (API + WebSocket)
- `webmail-ui` — Static React build served by nginx
- Two Kubernetes Deployments behind a single Ingress

Both options deploy into the hosting platform's existing Kubernetes cluster. The Helm chart in the hosting project gets a webmail section that references the webmail container image.

## Implementation Phases

| Phase | Name | Scope | Plan |
|-------|------|-------|------|
| 0 | Hosting Platform Changes | Scoped API key, stalwart-context endpoint, Sieve composition, WKD | `12-hosting-platform-changes.md` |
| 1 | Backend API & Auth | Go proxy, session management, JMAP passthrough, WebSocket | `01-backend-api.md` |
| 2 | Core Mail UI | Three-pane layout, message list, read, folders, keyboard shortcuts | `02-core-mail-ui.md` |
| 2.5 | Real-Time & Async | WebSocket push, JMAP delta sync, Temporal for bulk ops | `03-realtime-and-async.md` |
| 3 | Compose & Attachments | Rich text editor, file attachments, drafts, signatures, undo send | `04-compose-and-attachments.md` |
| 4 | Search & Filters | Full-text search, structured queries, Sieve rule management | `05-search-and-filters.md` |
| 5 | Contacts | Contact list, CRUD, groups, autocomplete in compose, import/export | `06-contacts.md` |
| 6 | Calendar | Calendar views, event CRUD, recurring events, .ics invitations | `07-calendar.md` |
| 7 | PGP Encryption | Client-side encrypt/decrypt/sign/verify with OpenPGP.js | `11-pgp-encryption.md` |
| 8 | Settings & UX Polish | Animations, density, accessibility, empty states | `10-settings-and-ux-polish.md` |
| - | Security (cross-cutting) | Applied to every phase | `08-security.md` |
| - | Performance (cross-cutting) | Applied to every phase | `09-performance.md` |

Phase 0 must be implemented first — it adds the hosting platform infrastructure that the webmail depends on.

Detailed plans for each phase follow in separate documents.
