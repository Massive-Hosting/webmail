# Phase 7 — Settings & UX Polish

## Goal

Settings page for user preferences, plus the micro-interactions, animations, and density options that elevate the experience from "functional" to "delightful." This is what separates a premium webmail from an open-source one.

## Settings Page

Accessible via gear icon in toolbar or keyboard shortcut.

### Settings Sections

**General:**
- Theme: System / Light / Dark
- Language: (future — i18n framework placeholder)
- Density: Comfortable / Compact (affects row heights, padding, font sizes)
- Start page: Inbox / Last viewed mailbox

**Mail:**
- Conversation view: On (default) / Off (flat message list)
- Reading pane position: Right (default) / Bottom / Off (list-only mode)
- Auto-advance after action: Next message / Previous message / Return to list
- Mark as read: Immediately / After 2 seconds / Manually
- Undo send delay: Off / 5s / 10s / 30s
- Default reply mode: Reply / Reply All
- Load external images: Never / Ask each time / Always (with security warning)

**Signatures:**
- List of signatures
- Create / Edit / Delete signature (rich text editor)
- Default signature per identity

**Filters:**
- Filter rules list (see Phase 4)
- Create / Edit / Delete / Reorder rules

**Keyboard Shortcuts:**
- Enable/disable keyboard shortcuts
- Reference card showing all shortcuts

**Notifications:**
- Desktop notifications: On / Off
- Notification sound: On / Off
- Notify for: All new mail / Only from contacts / Only important

**Storage:**
- Current usage vs quota (progress bar)
- Usage breakdown by folder (horizontal bar chart)
- "Empty Trash" and "Empty Junk" quick actions

### Settings Storage

All user settings roam across devices. Nothing important lives in localStorage.

**Server-side (roams):**

| Data | Storage | Mechanism |
|------|---------|-----------|
| Signatures | JMAP Identity (Stalwart) | `htmlSignature` / `textSignature` fields via `Identity/set` |
| Filter rules | Sieve scripts (Stalwart) | JMAP `SieveScript/set` |
| UI preferences | Webmail DB | `user_preferences.preferences` (JSONB) |
| PGP public keys | Webmail DB | `user_preferences.pgp_public_key` (TEXT) |

The webmail has its own PostgreSQL database with a `user_preferences` table (keyed by email address).
This is read/written directly by the webmail API — no core API proxy needed.

```
GET  /api/settings       → reads from webmail DB
PUT  /api/settings       → writes to webmail DB
GET  /api/pgp/key        → reads from webmail DB
PUT  /api/pgp/key        → writes to webmail DB
DELETE /api/pgp/key      → writes to webmail DB
```

**Preferences JSON structure:**
```json
{
  "theme": "system",
  "density": "comfortable",
  "readingPane": "right",
  "conversationView": true,
  "autoAdvance": "next",
  "markReadDelay": 0,
  "undoSendDelay": 5,
  "defaultReplyMode": "reply",
  "externalImages": "ask",
  "keyboardShortcuts": true,
  "notifications": {
    "enabled": true,
    "sound": false,
    "scope": "all"
  },
  "trustedImageDomains": ["github.com", "linkedin.com"],
  "panelSizes": {
    "sidebar": 240,
    "messageList": 380
  }
}
```

**Client-side caching:**
- On login, fetch preferences once and cache in Zustand (memory)
- Changes write through: update Zustand immediately, PUT to server in background (debounced 1 second)
- On next login (any device), fresh preferences loaded from server
- localStorage used only as a **write-ahead cache** for crash resilience — if the PUT fails mid-session, the next page load retries from the cached value before falling back to server

**Acceptance Criteria:**
- [ ] All settings roam across devices (log in on new device, see your settings)
- [ ] All settings sections accessible and functional
- [ ] Settings changes apply immediately (no save button needed)
- [ ] Preferences saved to webmail DB
- [ ] Write-through: update local state + background PUT (debounced 1s)
- [ ] Signatures persist via JMAP Identity (roam across devices)
- [ ] Settings reset option ("Restore defaults") clears preferences JSON
- [ ] Storage usage display shows accurate quota data from JMAP
- [ ] PGP public key stored server-side for WKD serving

## Density Modes

Two density modes affecting the entire UI:

**Comfortable (default):**
- Message list row: 72px
- Sidebar item: 40px
- Toolbar: 56px
- Body text: 14px
- Spacing: generous (16px/24px)

**Compact:**
- Message list row: 48px
- Sidebar item: 32px
- Toolbar: 44px
- Body text: 13px
- Spacing: tight (8px/12px)

Implemented via CSS custom properties toggled by a `.density-compact` class on `<html>`:
```css
:root {
  --density-row-height: 72px;
  --density-sidebar-item: 40px;
  --density-toolbar: 56px;
  --density-text: 14px;
  --density-spacing: 16px;
}

.density-compact {
  --density-row-height: 48px;
  --density-sidebar-item: 32px;
  --density-toolbar: 44px;
  --density-text: 13px;
  --density-spacing: 8px;
}
```

**Acceptance Criteria:**
- [ ] Both density modes render correctly with no overflow or clipping
- [ ] Density change is instant (no page reload)
- [ ] Virtualized lists adjust to new row height seamlessly
- [ ] Density preference persists

## Animations & Micro-Interactions

### Transitions

| Element | Trigger | Animation | Duration |
|---------|---------|-----------|----------|
| Message list | Folder switch | Crossfade (opacity) | 150ms |
| Reading pane | Message open | Slide-in from right (mobile) / crossfade (desktop) | 200ms |
| Compose | Open | Slide-up from bottom | 200ms ease-out |
| Compose | Minimize | Collapse to bottom bar | 200ms ease-in |
| Message action | Archive/delete | Row slides out left, gap closes | 250ms |
| Folder tree | Expand/collapse | Height transition | 150ms |
| Dropdown | Open | Scale + opacity from 0.95/0 to 1/1 | 100ms |
| Dialog | Open | Scale + opacity from 0.95/0 to 1/1 | 150ms |
| Toast | Appear | Slide-in from right | 200ms |
| Toast | Dismiss | Fade out | 150ms |
| Theme toggle | Switch | All colors transition | 150ms |
| Star | Toggle | Scale bounce 1→1.2→1 | 200ms |

### Hover Effects

- Message row: subtle background change + shadow lift
- Buttons: background shift + slight scale (1.02x)
- Folder items: background tint
- Avatar: slight zoom (1.05x)
- Attachment chips: border color shift

### Loading States

- **Skeleton loaders**: Used for message list, contact list, calendar grid (shaped like actual content)
- **Shimmer effect**: Subtle gradient animation on skeletons
- **Inline spinners**: Only for small action buttons (send, upload)
- **Progress bars**: For file uploads, bulk operations
- **Never**: Full-page spinners or blocking loading overlays

### Empty States

Each empty state has:
- Relevant illustration (SVG, ~100px, matches theme)
- Primary text: what the state is ("No messages")
- Secondary text: what to do ("Messages you receive will appear here")
- Optional action button ("Compose a message")

Empty states for: Inbox, Search results, Contacts, Calendar day, Drafts, Trash, Junk, Custom folder

### Focus & Keyboard Indicators

- Custom focus ring: 2px accent color outline with 2px offset
- Focus-visible only (no focus ring on mouse click)
- Active/selected state distinct from focus state
- Skip-navigation link (hidden, visible on Tab)
- `aria-current` on active folder in sidebar

### Error States

- **Network error**: Toast with retry button, persists until resolved
- **Session expired**: Modal overlay with "Session expired. [Log in again]"
- **JMAP error**: Toast with error description, auto-dismiss after 5s
- **Offline**: Banner at top "You're offline — showing cached data"

**Acceptance Criteria:**
- [ ] All animations respect `prefers-reduced-motion` (disabled when set)
- [ ] Animations use GPU-accelerated properties only (transform, opacity)
- [ ] No animation causes layout shift (CLS: 0)
- [ ] Skeleton loaders match content shape for each section
- [ ] Empty states have illustrations and helpful text
- [ ] Focus indicators visible on keyboard navigation, hidden on mouse
- [ ] Error states are clear, actionable, and non-blocking where possible

## Accessibility

### WCAG AA Compliance

- **Color contrast**: All text meets 4.5:1 ratio (3:1 for large text) in both themes
- **Keyboard navigation**: All features reachable via keyboard
- **Screen reader**: Semantic HTML, ARIA labels, live regions for dynamic content
- **Focus management**: Focus trapped in modals, restored on close
- **Motion**: All animations respect `prefers-reduced-motion`
- **Resize**: UI usable at 200% zoom without horizontal scroll

### ARIA Landmarks

```html
<header role="banner">          <!-- Toolbar -->
<nav role="navigation">         <!-- Sidebar folders -->
<main role="main">              <!-- Message list + reading pane -->
<aside role="complementary">    <!-- Agenda sidebar -->
<div role="status" aria-live="polite"> <!-- Unread count, toast messages -->
```

### Specific ARIA Patterns

- **Message list**: `role="listbox"` with `aria-selected` on active message
- **Folder tree**: `role="tree"` with `role="treeitem"` and `aria-expanded`
- **Compose**: `role="dialog"` with `aria-labelledby`
- **Search**: `role="combobox"` with `aria-autocomplete="list"`
- **Toolbar actions**: `aria-label` on icon-only buttons
- **Unread badge**: `aria-label="3 unread messages"` on badge element
- **Message actions**: `aria-label` describing action result ("Move to Trash")
- **Loading states**: `aria-busy="true"` on loading containers

**Acceptance Criteria:**
- [ ] Lighthouse accessibility score >95
- [ ] Screen reader (VoiceOver/NVDA) can navigate all features
- [ ] All interactive elements reachable via keyboard
- [ ] Focus management correct in modals and drawers
- [ ] Live regions announce dynamic changes (new messages, action results)
- [ ] Color is never the sole indicator of state (always paired with icon/text)
