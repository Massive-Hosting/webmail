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
| Keyboard shortcuts | Gmail/Outlook-inspired shortcuts for power users |
| Dark and light themes | System preference detection with manual override |

### Search & Filters

| Feature | Description |
|---|---|
| Full-text search | Structured queries — `from:`, `to:`, `subject:`, `has:attachment`, and more |
| Advanced search dialog | Visual query builder for complex searches |
| Server-side Sieve filters | Visual rule editor with safe script composition via `include :personal` |

### Contacts

| Feature | Description |
|---|---|
| JMAP Contacts | Full JSContact (RFC 9610) integration via Stalwart |
| Autocomplete | Contact suggestions while composing |
| Address books & groups | Organize contacts into books and groups |
| vCard import/export | Bulk import and export in standard vCard format |

### Calendar

| Feature | Description |
|---|---|
| Multiple views | Month, week, and day layouts |
| Event management | Create, edit, delete events with recurrence rules |
| Agenda sidebar | Today's schedule visible alongside your inbox |
| Meeting invitations | Accept, decline, and propose new times for .ics invitations |

### Security

| Feature | Description |
|---|---|
| PGP encryption & signing | Client-side OpenPGP.js — encrypt, decrypt, sign, verify |
| One-click PGP setup | Key generation with passphrase derived from login credentials |
| WKD key discovery | Automatic public key lookup via Web Key Directory |
| HTML sanitization | DOMPurify strips dangerous content from email bodies |
| External image blocking | Tracking pixel protection with one-click load |
| Encrypted sessions | AES-256-GCM encrypted session cookies |
| Security headers | CSP, HSTS, CORS, and X-Content-Type-Options enforced |
| Rate limiting | Per-user request throttling |

### Real-Time & Performance

| Feature | Description |
|---|---|
| WebSocket push | Live updates via Stalwart JMAP EventSource |
| Delta sync | JMAP `/changes` — only fetch what changed |
| Optimistic UI | Mutations update instantly, sync in background, rollback on failure |
| Background task tray | Progress indicators for bulk operations |
| ~60 KB initial bundle | Gzipped, code-split by route |
| Lazy loading | Calendar, contacts, PGP, and settings loaded on demand |
| Prefetch on hover | Next-page data starts loading before you click |

---

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
                               |
                      +--------+---------+
                      |    Stalwart      |
                      |  Mail Server     |
                      +------------------+
```

The Go backend is a **stateless proxy**. It translates browser session cookies into Stalwart credentials and forwards JMAP requests. All email, contact, and calendar data lives in Stalwart. The webmail's own PostgreSQL database stores only lightweight metadata: partner branding, user preferences, and PGP public keys.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React 19 | Component framework |
| TypeScript 5.9 | Type safety and JMAP type definitions |
| Vite 8 | Build tooling and dev server |
| TanStack Router | Type-safe file-based routing |
| TanStack Query | Data fetching, caching, and optimistic updates |
| TanStack Virtual | Virtualized lists for large mailboxes |
| Zustand | UI state management (panels, drafts, selections) |
| Tiptap | ProseMirror-based rich text editor |
| Radix UI | Accessible, unstyled component primitives |
| Tailwind CSS 4 | Utility-first styling with dark mode |
| OpenPGP.js | Client-side PGP encryption |
| DOMPurify | HTML email sanitization |
| Lucide React | Icon set |
| dnd-kit | Drag-and-drop (messages, folders) |
| date-fns | Date formatting |
| Sonner | Toast notifications |

### Backend

| Technology | Purpose |
|---|---|
| Go 1.25 | API server |
| Chi v5 | HTTP router |
| pgx v5 | PostgreSQL driver |
| Goose v3 | Database migrations |
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
| `WEBMAIL_RATE_LIMIT` | `120` | Maximum requests per user per minute |
| `WEBMAIL_ALLOWED_ORIGINS` | — | CORS allowed origins (comma-separated) |
| `VALKEY_URL` | — | Valkey/Redis URL for WebSocket progress relay |
| `TEMPORAL_ADDRESS` | — | Temporal cluster address for bulk async operations |

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

---

## Project Structure

```
webmail/
  cmd/webmail-api/          # Go entrypoint
  internal/
    handler/                # HTTP handlers (auth, proxy, blob, settings, websocket)
    middleware/              # Auth, rate limiting, security headers, partner resolution
    session/                # AES-GCM encrypted session store
    ws/                     # WebSocket hub and Stalwart EventSource subscriber
    db/                     # PostgreSQL queries (preferences, PGP keys, partners)
    hosting/                # Core API client (Stalwart URL resolution)
    config/                 # Environment-based configuration
    model/                  # Domain types
  migrations/               # Goose SQL migrations
  web/
    src/
      api/                  # API client and JMAP type definitions
      components/
        layout/             # App shell, three-pane layout, resizable panels
        mail/               # Message list, thread view, compose, search, toolbar
        contacts/           # Contact list, detail, form
        calendar/           # Month/week/day views, event form, agenda sidebar
        ui/                 # Shared primitives (button, input, dialog, etc.)
      hooks/                # React hooks (mailboxes, messages, contacts, keyboard, theme)
      stores/               # Zustand stores (UI state, compose drafts, settings)
      routes/               # TanStack Router file-based routes
      lib/                  # Utilities (JMAP helpers, sanitizer, PGP, search parser)
  docs/plans/               # Architecture and implementation plans
  Dockerfile                # Multi-stage build (Go API + React SPA)
  justfile                  # Development commands
```

---

## Deployment

The webmail ships as a **single container** — the Go binary serves both the API and the embedded React build (`embed.FS`).

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
