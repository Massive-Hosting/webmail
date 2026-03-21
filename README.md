# Webmail

**A modern, JMAP-native webmail client built for speed and polish.**

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![JMAP](https://img.shields.io/badge/Protocol-JMAP-8B5CF6)

Webmail is a full-featured email, contacts, and calendar client that connects to [Stalwart Mail Server](https://stalw.art) via the JMAP protocol. It pairs a React 19 single-page application with a stateless Go proxy backend — all mail state lives in Stalwart, making the webmail layer lightweight and horizontally scalable.

---

## Features

### Mail

| Feature | Description |
|---|---|
| Three-pane layout | Resizable sidebar, message list, and reading pane |
| Threaded conversations | Messages grouped by thread with collapsible view |
| Virtualized message list | Smooth scrolling through 10,000+ messages (TanStack Virtual) |
| Rich text compose | Tiptap editor with formatting, tables, images, and inline links |
| Drag-and-drop attachments | Drop files onto the compose window or drag messages between folders |
| Draft auto-save | Drafts saved automatically as you type |
| Undo send | Configurable delay window to cancel sent messages |
| Email scheduling | "Send later" with presets (1h, 2h, tomorrow 9am, custom) via Temporal workflow |
| Snooze | Hide emails until a chosen time — resurfaces as unread in inbox |
| Email templates | Save and reuse compose templates (subject + body) |
| Print | Clean print-friendly view with headers, body, and attachment list |
| Keyboard shortcuts | Gmail/Outlook-inspired shortcuts for power users |
| Dark and light themes | System preference detection with manual override |
| Auto-advance | Navigate to next/previous message after delete or archive |
| Folder colors | Color-code mail folders for visual organization |
| Read/unread indicators | Bold text, blue dot, and tinted background for unread emails |

### Search & Filters

| Feature | Description |
|---|---|
| Full-text search | Structured queries — `from:`, `to:`, `subject:`, `has:attachment`, and more |
| Advanced search dialog | Visual query builder for complex searches |
| Saved searches | Bookmark frequent searches as virtual folders in the sidebar |
| Server-side Sieve filters | Visual rule editor with drag-to-reorder |
| Custom Sieve editor | Raw Sieve script editor for power users |

### Contacts

| Feature | Description |
|---|---|
| JMAP Contacts | Full JSContact (RFC 9610) integration via Stalwart |
| Autocomplete | Contact suggestions while composing |
| Address books & groups | Organize contacts into books and groups |
| Contact photos | Upload and display profile photos |
| vCard import/export | Bulk import and export in standard vCard format with progress |

### Calendar

| Feature | Description |
|---|---|
| Multiple views | Month, week, and day layouts |
| Event management | Create, edit, delete events with recurrence rules |
| Drag-and-drop events | Drag to reschedule events in week and day views (15-min snap) |
| Agenda sidebar | Today's schedule visible alongside your inbox |
| Meeting invitations | Accept, decline, and tentatively accept .ics invitations |
| Send invitations | Creating an event with attendees sends RFC 5545 .ics invitation emails |
| RSVP replies | Accepting or declining sends a REPLY email back to the organizer |
| Cancellation emails | Deleting an event with attendees sends CANCEL emails automatically |
| RSVP tracking | See attendee acceptance status on events |
| Calendar colors | Per-calendar color coding |
| Calendar sharing | Share calendars with other users (view or edit) |
| ICS import | Import .ics calendar files with batch progress |

### AI Assistant

| Feature | Description |
|---|---|
| Conversational copilot | Chat-style AI panel with email context awareness |
| Smart suggestions | Explain, summarize, extract action items, draft replies, translate |
| Tone selection | Professional, friendly, or concise reply generation |
| Compose integration | AI-assisted drafting from the compose toolbar |

### Security

| Feature | Description |
|---|---|
| TOTP two-factor auth | Enable 2FA with any authenticator app (Google Authenticator, Authy) |
| App passwords | Generate per-device passwords for IMAP/SMTP clients (Thunderbird, Outlook) |
| PGP encryption & signing | Client-side OpenPGP.js — encrypt, decrypt, sign, verify |
| One-click PGP setup | Key generation with passphrase derived from login credentials |
| WKD key discovery | Automatic public key lookup via Web Key Directory |
| Spam filter training | Mark as spam/not spam trains Stalwart's Bayesian classifier |
| Spam score display | X-Spam-Status header shown in Junk folder with "Not spam" action |
| SPF/DKIM/DMARC/ARC display | Email authentication results in message properties |
| HTML sanitization | DOMPurify strips dangerous content from email bodies |
| External image blocking | Tracking pixel protection with one-click load |
| Encrypted sessions | AES-256-GCM encrypted secrets in Valkey with user-agent binding |
| Security headers | CSP, HSTS, CORS, and X-Content-Type-Options enforced |
| Rate limiting | Per-user request throttling with login-specific limits |

### Collaboration

| Feature | Description |
|---|---|
| Folder sharing | Share mailbox folders with other users (view or edit permissions) |
| Address book sharing | Share address books with other users via JMAP shareWith |
| Calendar sharing | Share calendars with other users (view or edit) |
| ACL enforcement | Folder operations gated by JMAP myRights (rename, delete, drag-drop) |
| Shared resource overview | Settings > Accounts shows all shared folders, calendars, and address books |
| Command palette | Cmd+K quick actions — navigate, compose, search, toggle theme |

### Real-Time & Performance

| Feature | Description |
|---|---|
| WebSocket push | Live updates via Stalwart JMAP EventSource |
| Delta sync | JMAP `/changes` — only fetch what changed |
| Optimistic UI | Mutations update instantly, sync in background, rollback on failure |
| Temporal workflows | Background task processing for bulk operations (>50 emails) |
| Background task tray | Progress indicators for bulk operations with download links |
| ~60 KB initial bundle | Gzipped, code-split by route |
| Lazy loading | Calendar, contacts, PGP, and settings loaded on demand |
| Prefetch on hover | Next-page data starts loading before you click |

### Bulk Operations (via Temporal)

| Operation | Description |
|---|---|
| Bulk move | Move thousands of emails between folders with progress |
| Bulk delete | Permanently delete emails in batches |
| Bulk mark read | Mark large selections as read/unread |
| Mailbox export | Export folder as .mbox file with download link |
| Mailbox import | Import .mbox file with batch progress |
| Scheduled send | Delayed email delivery via Temporal timer |
| Snooze | Timed email resurfacing via Temporal timer |

### Settings

| Section | Features |
|---|---|
| General | Theme, density, language (EN/NO/DE), start page |
| Mail | Reading pane position, auto-advance, mark-read delay, undo send delay, default reply mode, external images |
| Signatures | Per-identity HTML signatures with rich text editor |
| Templates | Reusable email templates with subject + body |
| Vacation | Out-of-office auto-reply with date range |
| Filters | Visual Sieve rule editor + raw Sieve script editor |
| Shortcuts | Enable/disable keyboard shortcuts with reference guide |
| Notifications | Desktop notifications and notification sound |
| Storage | Storage quota display with quick actions |
| Security | PGP key management, sign/encrypt defaults |
| Accounts | Current account info, delegate access placeholder |

### Internationalization

| Language | Status |
|---|---|
| English | Complete (~650 keys) |
| Norwegian (Bokmål) | Complete |
| German | Complete |

### Accessibility

- ARIA landmarks (banner, navigation, main, complementary)
- Keyboard navigation with configurable shortcuts
- Skip-to-content link
- Screen reader status announcements
- Focus-visible outlines
- `prefers-reduced-motion` support

### Mobile

- Responsive single-pane layout below 768px
- Sidebar/list/message view switching
- Touch-friendly tap targets
- Mobile-optimized compose and reading pane

---

## Architecture

```
                      +------------------+
                      |   Browser (SPA)  |
                      |  React 19 + TS   |
                      +--------+---------+
                               |
                      HTTPS (JSON API + WebSocket)
                               |
                      +--------+---------+
                      |  Webmail API     |
                      |  Go + Chi        |
                      |  (stateless)     |
                      +---+---------+----+
                          |         |
                   JMAP over     Temporal
                    HTTPS       workflows
                          |         |
                      +---+----+ +--+-------+
                      |Stalwart| | Temporal |
                      |  Mail  | |  Server  |
                      +--------+ +----------+
```

The Go backend is a **stateless proxy**. It translates browser session cookies into Stalwart credentials and forwards JMAP requests. All email, contact, and calendar data lives in Stalwart. The webmail's own PostgreSQL database stores only lightweight metadata: partner branding, user preferences, and PGP public keys.

An embedded **Temporal worker** runs in-process for background operations: bulk moves, mailbox export/import, scheduled send, and snooze. Progress is relayed to the browser via Valkey pub/sub and WebSocket.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React 19 | Component framework |
| TypeScript 5.9 | Type safety and JMAP type definitions |
| Vite 8 | Build tooling and dev server |
| TanStack Query | Data fetching, caching, and optimistic updates |
| TanStack Virtual | Virtualized lists for large mailboxes |
| Zustand | UI state management (panels, drafts, selections, settings) |
| Tiptap | ProseMirror-based rich text editor |
| Radix UI | Accessible, unstyled component primitives |
| Tailwind CSS 4 | Utility-first styling with dark mode |
| OpenPGP.js | Client-side PGP encryption |
| DOMPurify | HTML email sanitization |
| Lucide React | Icon set |
| dnd-kit | Drag-and-drop (messages, folders) |
| date-fns | Date formatting |
| Sonner | Toast notifications |
| i18next | Internationalization |
| Vitest + Playwright | Unit and E2E testing |

### Backend

| Technology | Purpose |
|---|---|
| Go 1.25 | API server |
| Chi v5 | HTTP router and middleware |
| pgx v5 | PostgreSQL driver |
| Goose v3 | Database migrations |
| Temporal SDK | Background workflow processing |
| go-redis v9 | Valkey/Redis client for sessions and pub/sub |
| zerolog | Structured logging |
| Prometheus | Metrics and monitoring |
| coder/websocket | WebSocket connections |

---

## Getting Started

### Prerequisites

- **Go** 1.25+
- **Node.js** 22+
- **PostgreSQL** (any recent version)
- **Stalwart Mail Server** with JMAP enabled
- **Temporal Server** (optional — for bulk operations, scheduled send, snooze)
- **Valkey/Redis** (for sessions and WebSocket progress relay)
- **just** command runner ([installation](https://github.com/casey/just#installation))

### Setup

```bash
# Clone the repository
git clone <repo-url> && cd webmail

# Install frontend dependencies
just install-ui

# Copy and edit configuration
cp .env.example .env
# Edit .env with your database URL, Stalwart URL, and API keys

# Run database migrations
just migrate

# Start the backend API (terminal 1)
just dev

# Start the frontend dev server (terminal 2)
just dev-ui
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `WEBMAIL_LISTEN_ADDR` | `:8095` | Address and port for the Go API server |
| `WEBMAIL_DATABASE_URL` | — | PostgreSQL connection string |
| `WEBMAIL_CORE_API_URL` | — | Hosting platform core API URL (for Stalwart resolution) |
| `WEBMAIL_API_KEY` | — | Service-to-service API key for the core API |
| `SECRET_ENCRYPTION_KEY` | — | 64-char hex key for AES-256-GCM session encryption |
| `WEBMAIL_SESSION_MAX_AGE` | `86400` | Session cookie lifetime in seconds (default: 24h) |
| `WEBMAIL_MAX_UPLOAD_SIZE` | `26214400` | Maximum attachment upload size in bytes (default: 25 MB) |
| `WEBMAIL_RATE_LIMIT` | `1200` | Maximum requests per user per minute |
| `WEBMAIL_ALLOWED_ORIGINS` | — | CORS allowed origins (comma-separated) |
| `VALKEY_URL` | `redis://127.0.0.1:6379/0` | Valkey/Redis URL for sessions and progress relay |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal cluster address for async workflows |
| `AI_ENABLED` | `false` | Enable AI assistant features |
| `AI_BASE_URL` | — | AI API endpoint URL |
| `AI_API_KEY` | — | AI API key |
| `AI_MODEL` | — | AI model identifier |

---

## Testing

```bash
# Run all tests (Go unit tests + Vitest)
just test

# Run Go tests with race detector
just test-go-race

# Run frontend unit tests in watch mode
just test-ui-watch

# Run Playwright end-to-end tests
just test-e2e

# Run the full CI gate (build + vet + typecheck + tests)
just check
```

### Test Coverage

- **Go:** 50+ tests covering handlers, session management, WebSocket hub, event source parsing, config loading, task endpoints, mbox parsing, Valkey subscriber
- **TypeScript:** 135+ unit tests covering formatters, search parsing, HTML sanitization, PGP detection, Sieve generation, vCard parsing, ICS import, email header parsing
- **E2E:** 9 Playwright spec files covering auth, inbox, message viewing, search, navigation, settings, calendar, contacts, and compose

---

## Project Structure

```
webmail/
  cmd/webmail-api/          # Go entrypoint
  internal/
    handler/                # HTTP handlers (auth, proxy, blob, settings, tasks, websocket)
    middleware/              # Auth, rate limiting, security headers, partner resolution
    session/                # Valkey-backed session store
    ws/                     # WebSocket hub, EventSource subscriber, Valkey progress relay
    worker/                 # Embedded Temporal worker
    workflow/               # Temporal workflow definitions
    activity/               # Temporal activity implementations (JMAP ops, blob, mbox)
    db/                     # PostgreSQL queries (preferences, PGP keys, partners)
    hosting/                # Core API client (Stalwart URL resolution)
    config/                 # Environment-based configuration
    model/                  # Domain types
  migrations/               # Goose SQL migrations
  web/
    src/
      api/                  # API clients (JMAP mail, contacts, calendar, tasks, AI)
      components/
        layout/             # App shell, three-pane layout, resizable panels, toolbar
        mail/               # Message list, thread view, compose, search, action bar
        contacts/           # Contact list, detail, form, import/export, photos
        calendar/           # Month/week/day views, event form, sharing, ICS import
        settings/           # Settings dialog, templates, Sieve editor, accounts
        ui/                 # Shared primitives (avatar, badge, skeleton, task tray)
      hooks/                # React hooks (messages, contacts, calendar, keyboard, tasks)
      stores/               # Zustand stores (UI, compose, settings, auth, search, PGP)
      lib/                  # Utilities (JMAP, sanitizer, PGP, search parser, print)
      i18n/                 # Translations (en, no, de)
  docs/plans/               # Architecture and implementation plans
  Dockerfile                # Multi-stage build (Go API + React SPA)
  justfile                  # Development commands
```

---

## Deployment

The webmail ships as a **single container** — the Go binary serves both the API and the embedded React build (`embed.FS`). The Temporal worker runs in-process.

```bash
# Build the Docker image
just docker-build

# Run it
docker run -p 8095:8095 --env-file .env webmail:latest
```

For production, the webmail deploys into the hosting platform's Kubernetes cluster via its Helm chart. It runs as a stateless Deployment behind an Ingress, connecting to Stalwart over the internal network.

---

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run `just check` to verify everything passes
4. Open a pull request

Please keep commits focused and write descriptive PR descriptions.

---

## License

Private — not currently open source.
