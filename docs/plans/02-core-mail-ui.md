# Phase 2 — Core Mail UI

## Goal

Build the primary email interface: a responsive three-pane layout with folder navigation, virtualized message list, threaded conversation view, and basic email actions. This is the foundation that makes or breaks the "better than Outlook" goal — every interaction must feel instant.

## Prerequisites

- Phase 1 (Backend API & Auth) complete and functional

## Layout Architecture

```
+-------------------------------------------------------------+
|  Toolbar: Search | Compose | Settings | Theme Toggle         |
+----------+---------------------+----------------------------+
|          |                     |                            |
| Sidebar  |   Message List      |   Reading Pane             |
|          |                     |                            |
| Folders  |   Virtualized       |   Thread / Message View    |
| + Counts |   Scroll            |                            |
|          |                     |   Reply inline             |
|          |                     |                            |
+----------+---------------------+----------------------------+
```

**Responsive breakpoints:**
- Desktop (>1200px): Three panes visible
- Tablet (768–1200px): Sidebar collapses to icons, two panes
- Mobile (<768px): Single pane with navigation stack

Panel sizes are persisted to localStorage and restorable via drag handles.

## Tasks

### 2.1 — App Shell & Layout

Create the foundational layout with resizable, collapsible panes.

**Components:**
- `app-shell.tsx` — Root layout with toolbar, sidebar, content area
- `sidebar.tsx` — Folder tree + account switcher + navigation (Mail/Contacts/Calendar)
- `mail-list-pane.tsx` — Message list container with toolbar
- `reading-pane.tsx` — Message/thread display container
- `resize-handle.tsx` — Draggable divider between panes

**Layout behavior:**
- Sidebar default width: 240px (min: 200px, max: 360px)
- Message list default width: 380px (min: 300px, max: 600px)
- Reading pane fills remaining space
- Double-click resize handle to reset to defaults
- Panel sizes saved to roaming preferences (via `PUT /api/settings`, debounced 1s)

**Acceptance Criteria:**
- [ ] Three-pane layout renders with correct proportions
- [ ] Panels resize smoothly via drag (no jank, uses CSS `resize` or pointer events + `flex-basis`)
- [ ] Sidebar collapses to 56px icon-only mode (toggle button or auto at <1200px)
- [ ] Mobile view shows single pane with back navigation
- [ ] Panel sizes persist across page reloads
- [ ] Layout uses CSS Grid or Flexbox (no absolute positioning)
- [ ] All panes have proper overflow scrolling
- [ ] Keyboard shortcut: `[` toggles sidebar, `]` toggles reading pane

### 2.2 — Theme System (Dark/Light Mode)

Implement a theme system using CSS custom properties and Tailwind's `dark:` variant.

**Theme strategy:**
- Three modes: System (default), Light, Dark
- Toggle control in toolbar
- Preference saved to roaming settings (synced to server) + cached locally for instant theme on load
- CSS variables defined at `:root` and `.dark` scope
- Transitions: `transition-colors duration-150` on `<html>` to prevent flash

**Color tokens (CSS custom properties):**
```css
:root {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8f9fa;
  --color-bg-tertiary: #f1f3f5;
  --color-bg-elevated: #ffffff;
  --color-bg-overlay: rgba(0, 0, 0, 0.5);
  --color-bg-accent: #4f46e5;
  --color-bg-accent-hover: #4338ca;
  --color-bg-danger: #ef4444;
  --color-bg-success: #22c55e;
  --color-bg-warning: #f59e0b;

  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-text-inverse: #ffffff;
  --color-text-accent: #4f46e5;
  --color-text-danger: #ef4444;

  --color-border-primary: #e5e7eb;
  --color-border-secondary: #f3f4f6;
  --color-border-focus: #4f46e5;

  --color-message-unread: #eff6ff;
  --color-message-selected: #eef2ff;
  --color-message-hover: #f9fafb;
  --color-message-flagged: #fef3c7;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-elevated: 0 20px 25px rgba(0, 0, 0, 0.1);

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}

.dark {
  --color-bg-primary: #0f0f0f;
  --color-bg-secondary: #171717;
  --color-bg-tertiary: #1e1e1e;
  --color-bg-elevated: #1a1a1a;
  --color-bg-overlay: rgba(0, 0, 0, 0.7);
  --color-bg-accent: #6366f1;
  --color-bg-accent-hover: #818cf8;

  --color-text-primary: #f3f4f6;
  --color-text-secondary: #9ca3af;
  --color-text-tertiary: #6b7280;

  --color-border-primary: #2a2a2a;
  --color-border-secondary: #1f1f1f;

  --color-message-unread: #1a1a2e;
  --color-message-selected: #1e1b4b;
  --color-message-hover: #171717;
  --color-message-flagged: #1c1917;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
  --shadow-elevated: 0 20px 25px rgba(0, 0, 0, 0.5);
}
```

**Acceptance Criteria:**
- [ ] Light and dark modes are visually polished — not just inverted colors, but purpose-designed palettes
- [ ] Theme toggle is accessible in toolbar (sun/moon icon with smooth icon transition)
- [ ] System preference detection via `prefers-color-scheme` media query
- [ ] No flash of wrong theme on page load (inline `<script>` reads cached theme before render, server preference loads async)
- [ ] All components use CSS variables, never hardcoded colors
- [ ] Theme transition is smooth (150ms color transition, no layout shift)
- [ ] Contrast ratios meet WCAG AA (4.5:1 for text, 3:1 for large text)
- [ ] Email content area has its own background (white in both themes for readability, or adaptive)

### 2.3 — Login Page

A clean login page matching the design system.

**Fields:**
- Email address (autofocus, autocomplete="email")
- Password (autocomplete="current-password")
- "Remember me" checkbox (extends session to 30 days)
- Submit button with loading state

**Behavior:**
- Submit calls `POST /api/auth/login`
- On success, redirect to inbox
- On failure, show error inline (no alert dialogs)
- On 429 (rate limited), show "Too many attempts" with countdown

**Acceptance Criteria:**
- [ ] Clean, centered card layout that looks great in both themes
- [ ] Email field validates format before submission
- [ ] Password field has show/hide toggle
- [ ] Loading spinner on submit button during authentication
- [ ] Error messages are clear but don't leak info (no "user not found" vs "wrong password" distinction)
- [ ] Enter key submits form
- [ ] Redirects to originally requested URL after login (return URL parameter)
- [ ] Tab order is correct (email → password → remember → submit)

### 2.4 — Folder Tree (Mailbox List)

Display the user's JMAP Mailboxes as a hierarchical tree.

**JMAP method:** `Mailbox/get` with properties `[id, name, parentId, role, sortOrder, totalEmails, unreadEmails, myRights]`

**Standard folders** (by JMAP role, in order):
1. Inbox (`role: "inbox"`)
2. Drafts (`role: "drafts"`)
3. Sent (`role: "sent"`)
4. Archive (`role: "archive"`)
5. Junk (`role: "junk"`)
6. Trash (`role: "trash"`)
7. Custom folders (no role, sorted by `sortOrder`)

**Features:**
- Unread count badge on each folder (bold when >0)
- Total count shown on hover tooltip
- Expand/collapse for nested folders
- Right-click context menu: New subfolder, Rename, Delete, Mark all read, Empty (for Trash/Junk)
- Drag-drop messages onto folders to move
- Drag-drop folders to reorder or nest (JMAP `Mailbox/set` update parentId/sortOrder)
- Active folder highlighted

**Acceptance Criteria:**
- [ ] All JMAP mailboxes displayed in correct hierarchy
- [ ] Standard folders have appropriate icons (inbox, send, file, trash, etc.)
- [ ] Unread counts update in real-time (after message actions + periodic refresh)
- [ ] Context menu appears on right-click with correct actions per folder type
- [ ] Cannot delete or rename standard role folders
- [ ] Empty Trash/Junk empties the folder (JMAP Email/set destroy)
- [ ] Create folder: inline input field appears in tree, creates on Enter
- [ ] Folder tree scrolls independently of other panes
- [ ] Drag-drop reordering calls Mailbox/set with updated sortOrder/parentId
- [ ] Keyboard: arrow keys navigate tree, Enter selects, Space toggles expand

### 2.5 — Message List (Virtualized)

Display messages in the selected mailbox using TanStack Virtual for smooth scrolling.

**JMAP method:** `Email/query` + `Email/get`

Query: `Email/query` with:
- `accountId`: session accountId
- `filter`: `{inMailbox: selectedMailboxId}`
- `sort`: `[{property: "receivedAt", isAscending: false}]`
- `collapseThreads`: true
- `position`: 0
- `limit`: 50 (fetch in pages)

Get: `Email/get` with properties:
```
[id, threadId, mailboxIds, from, to, cc, subject, receivedAt,
 size, preview, keywords, hasAttachment]
```

**Message list item displays:**
- Sender avatar (colored initials circle, or gravatar)
- Sender name (bold if unread)
- Subject line (bold if unread)
- Preview text (first line, truncated)
- Received date (smart format: "2:30 PM" today, "Mar 12" this year, "Mar 12, 2025" older)
- Star/flag indicator
- Attachment paperclip icon
- Unread dot indicator

**Virtualization:**
- Row height: 72px (fixed for virtualization)
- Overscan: 10 rows above and below viewport
- Fetch next page when scrolled within 5 rows of the end
- Show skeleton loaders for rows being fetched

**Acceptance Criteria:**
- [ ] Smooth scrolling through 10,000+ messages with no frame drops
- [ ] Initial load shows skeleton loaders, then populated rows
- [ ] Infinite scroll fetches next page seamlessly
- [ ] Unread messages have distinct visual treatment (bold + blue dot + tinted background)
- [ ] Flagged messages have star icon visible
- [ ] Attachment indicator shows for messages with attachments
- [ ] Date formatting is contextual (time for today, date for older)
- [ ] Click selects message and shows in reading pane
- [ ] Multi-select with Ctrl+Click and Shift+Click
- [ ] Checkbox appears on hover (left side) for multi-select
- [ ] Selected messages have highlighted background
- [ ] Right-click context menu: Reply, Forward, Mark read/unread, Star, Move to, Delete
- [ ] Keyboard: j/k or arrow keys move selection, Enter opens, x toggles select
- [ ] Empty state shows friendly illustration + "No messages" text

### 2.6 — Reading Pane (Message View)

Display the selected message or thread in the reading pane.

**JMAP method:** `Email/get` with full properties:
```
[id, threadId, mailboxIds, from, to, cc, bcc, replyTo, subject,
 sentAt, receivedAt, size, preview, keywords, hasAttachment,
 bodyStructure, bodyValues, attachments, headers]
```

With: `fetchHTMLBodyValues: true, fetchTextBodyValues: true, maxBodyValueBytes: 1048576`

**Message header display:**
- From: avatar + name + email (click to copy email)
- To/Cc: collapsible list (show 2, "+N more" expander)
- Date: full datetime with relative tooltip ("2 hours ago")
- Subject: prominent, above the header block

**Body rendering:**
- Prefer HTML body, fall back to text body
- HTML sanitization via DOMPurify:
  - Strip: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, event handlers
  - Allow: standard formatting tags, `<img>` (with proxy), `<a>` (with `target="_blank" rel="noopener"`)
  - Rewrite image URLs: external images → proxy through `/api/blob/` or show "Load external images" button
- Text body: render as `<pre>` with linkification (URLs → clickable links)
- Quote detection: collapse quoted text ("> " prefixed lines or `<blockquote>`) with "Show quoted text" toggle

**External images:**
- Blocked by default (privacy — prevents tracking pixels)
- "Load external images" banner at top of message
- Per-sender "Always load" preference (stored in localStorage)

**Attachments:**
- Attachment bar below message header
- Each attachment: icon (by file type) + filename + size + download button
- Inline images rendered within the message body
- Image attachments show thumbnail preview
- Click to download via `/api/blob/{blobId}`

**Acceptance Criteria:**
- [ ] HTML emails render correctly with full formatting
- [ ] All `<script>`, event handlers, and dangerous elements stripped
- [ ] External images blocked by default with load button
- [ ] Text emails render with preserved formatting and clickable links
- [ ] Quoted text collapsed by default with toggle
- [ ] Attachments listed with correct file type icons and sizes
- [ ] Attachment download works for all file types
- [ ] Inline images display within message body
- [ ] Long emails scroll within reading pane (not the whole page)
- [ ] Message header is sticky at top while scrolling body
- [ ] Empty reading pane shows helpful placeholder ("Select a message to read")
- [ ] Keyboard: r opens reply, a opens reply-all, f opens forward

### 2.7 — Thread View (Conversations)

When a message is part of a thread, show the full conversation.

**JMAP method:** `Thread/get` → then `Email/get` for all messages in thread

**Display:**
- Messages stacked vertically in chronological order
- Each message in thread shows sender, date, and collapse/expand toggle
- Most recent message expanded by default, older messages collapsed
- Collapsed messages show: sender + date + first-line preview
- Click to expand/collapse individual messages
- "Expand all" / "Collapse all" toggle at top

**Threading behavior:**
- Thread indicator in message list (shows message count: "3 messages")
- Thread messages may span multiple mailboxes (sent replies appear in thread)
- Unread messages in thread are auto-expanded

**Acceptance Criteria:**
- [ ] Thread displays all messages in chronological order
- [ ] Collapsed messages show sender + preview, expand on click
- [ ] Most recent message auto-expanded
- [ ] Unread messages in thread auto-expanded
- [ ] Thread count shown in message list item
- [ ] Replying to a thread message adds to the thread
- [ ] Thread view scrolls to newest message on open
- [ ] Expand/collapse animation is smooth (max-height transition)

### 2.8 — Message Actions

Implement core email actions that work on single or multiple selected messages.

**Actions:**

| Action | Shortcut | JMAP Method | Behavior |
|--------|----------|-------------|----------|
| Mark read | Shift+I | Email/set `keywords.$seen: true` | Optimistic update |
| Mark unread | Shift+U | Email/set `keywords.$seen: false` | Optimistic update |
| Star | S | Email/set `keywords.$flagged: toggle` | Optimistic update |
| Archive | E | Email/set move to Archive mailbox | Remove from current, add Archive |
| Delete | # or Del | Email/set move to Trash | Remove from current, add Trash |
| Permanent delete | Shift+Del | Email/set `destroy` | Confirmation dialog first |
| Move to folder | V | Email/set update `mailboxIds` | Folder picker dropdown |
| Mark as junk | J | Email/set move to Junk | Remove from current, add Junk |
| Not junk | Shift+J | Email/set move to Inbox | Remove from Junk, add Inbox |

**Optimistic updates pattern:**
1. Immediately update TanStack Query cache
2. Fire JMAP mutation in background
3. On success: cache already correct, no-op
4. On failure: revert cache, show error toast with "Retry" action

**Batch operations:**
- Multi-select via checkboxes → toolbar shows batch action buttons
- Batch toolbar: Archive, Delete, Move, Mark read, Mark unread, Star
- Progress indicator for large batches (>50 messages)
- JMAP supports batch `Email/set` in a single request

**Undo:**
- Move/delete/archive actions show undo toast for 5 seconds
- Undo reverts the JMAP operation (move back to original mailbox)
- Toast: "Moved to Trash. [Undo]"

**Acceptance Criteria:**
- [ ] All actions work on single message from reading pane
- [ ] All actions work on multi-selected messages from toolbar
- [ ] Optimistic updates make actions feel instant (<50ms visual feedback)
- [ ] Failed mutations revert cache and show error toast
- [ ] Undo toast appears for destructive actions (move, delete, archive)
- [ ] Undo actually reverts the action within 5-second window
- [ ] Permanent delete requires confirmation dialog
- [ ] Keyboard shortcuts work when message list or reading pane is focused
- [ ] Batch operations use single JMAP request (not N individual requests)
- [ ] Message list auto-advances to next message after action (configurable: next, previous, or return to list)

### 2.9 — Unread Counts & Auto-Refresh

Keep the UI synchronized with server state.

**Polling strategy:**
- Poll `Mailbox/get` every 60 seconds for updated unread counts
- Poll `Email/query` for current mailbox every 60 seconds for new messages
- Use JMAP `state` property for delta sync: if state changed, refetch; if not, skip
- TanStack Query `refetchInterval: 60000` with `refetchIntervalInBackground: false`

**Future: JMAP EventSource push (Phase 2+):**
- Stalwart supports JMAP push via EventSource
- When implemented, replace polling with push for instant updates
- Graceful fallback to polling if EventSource connection drops

**Notification behavior:**
- New message count shown in browser tab title: "(3) Inbox — Webmail"
- Favicon badge for unread count (dynamic favicon)
- Browser notification on new message arrival (requires permission)

**Acceptance Criteria:**
- [ ] Unread counts update within 60 seconds of new message arrival
- [ ] Tab title shows unread count
- [ ] Polling pauses when tab is not visible (refetchIntervalInBackground: false)
- [ ] JMAP state-based delta sync avoids unnecessary data transfer
- [ ] No polling storms: if a request is in-flight, don't start another
- [ ] Browser notifications show sender + subject (with user permission)

### 2.10 — Keyboard Shortcut System

Implement a global keyboard shortcut system inspired by Gmail/Outlook.

**Default shortcuts:**

| Category | Shortcut | Action |
|----------|----------|--------|
| Navigation | G then I | Go to Inbox |
| Navigation | G then S | Go to Sent |
| Navigation | G then D | Go to Drafts |
| Navigation | G then T | Go to Trash |
| Navigation | / | Focus search bar |
| Navigation | ? | Show keyboard shortcut help |
| Messages | J / Down | Next message |
| Messages | K / Up | Previous message |
| Messages | Enter / O | Open message/thread |
| Messages | Esc | Back to list (mobile) / deselect |
| Messages | X | Toggle select |
| Messages | * then A | Select all |
| Messages | * then N | Deselect all |
| Actions | R | Reply |
| Actions | A | Reply all |
| Actions | F | Forward |
| Actions | C | Compose new |
| Actions | E | Archive |
| Actions | # | Delete |
| Actions | S | Star/unstar |
| Actions | Shift+I | Mark read |
| Actions | Shift+U | Mark unread |
| Actions | V | Move to folder (opens picker) |
| Actions | Z | Undo last action |
| Layout | [ | Toggle sidebar |
| Layout | ] | Toggle reading pane |

**Implementation:**
- Global keydown listener on document
- Shortcut registry with context awareness (different shortcuts in compose vs list)
- Chord support (G then I = two sequential keys within 1 second)
- Disabled when focus is in text input/textarea/contenteditable
- Help dialog (?) shows all shortcuts in categorized grid

**Acceptance Criteria:**
- [ ] All shortcuts in table above functional
- [ ] Chord shortcuts work (G then I within 1 second window)
- [ ] Shortcuts disabled in text inputs and compose editor
- [ ] Help dialog shows all available shortcuts
- [ ] Focus indicator visible when navigating with keyboard
- [ ] Shortcuts discoverable via tooltips on toolbar buttons
- [ ] No conflicts with browser default shortcuts (Ctrl+T, Ctrl+W, etc.)

## Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| First Contentful Paint | <1.0s | Code splitting, minimal initial JS |
| Time to Interactive | <1.5s | Lazy load compose editor, calendar, contacts |
| Message list scroll | 60fps | TanStack Virtual, fixed row height |
| Message open | <100ms | Prefetch on hover, cached if previously viewed |
| Action feedback | <50ms | Optimistic updates, no server round-trip for UI |
| Folder switch | <200ms | Prefetch adjacent folders, cached data instant |
| Bundle size (initial) | <200KB gzipped | Code splitting by route, tree shaking |

## Visual Design Notes

The UI should feel premium — closer to a native desktop app than a website:
- **Depth through shadows**: Cards and elevated elements use subtle shadows, not borders
- **Micro-interactions**: Hover states, press states, selection animations
- **Typography**: System font stack (Inter if loaded, else system), clear hierarchy
- **Density**: Default "comfortable" spacing, with "compact" option for power users
- **Color accents**: Indigo/violet as primary accent — modern, professional, distinct from competitors
- **Loading states**: Skeleton loaders shaped like the content they replace, never spinners on content areas
- **Empty states**: Illustrated empty states with helpful text, not just "No messages"
- **Transitions**: Folder switch crossfades message list, message open slides reading pane content
