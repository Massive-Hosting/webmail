# Phase 3 — Compose, Rich Text & Attachments

## Goal

Build a compose experience that feels native — instant to open, fluid to type in, with drag-and-drop attachments, rich formatting, and multi-draft support. Every compose window is a JMAP Draft saved asynchronously in the background.

## Prerequisites

- Phase 2 (Core Mail UI) complete

## Compose Window

### Opening Modes

| Trigger | Pre-filled Fields |
|---------|-------------------|
| New message (C) | Empty |
| Reply (R) | To: original sender, Subject: "Re: ...", quoted body |
| Reply All (A) | To: sender, Cc: all recipients minus self, Subject: "Re: ...", quoted body |
| Forward (F) | Subject: "Fwd: ...", body includes original message, original attachments listed |
| Draft | All fields restored from saved draft |
| mailto: link | To: address from link, Subject/Body from link params |

### Compose UI

```
+----------------------------------------------------------+
| [Minimize] [Pop-out] [Expand]               [Send] [X]  |
+----------------------------------------------------------+
| From: [identity dropdown if multiple identities]          |
| To:   [recipient chips with autocomplete       ] [+Cc/Bcc]|
| Cc:   [recipient chips                          ]         |
| Bcc:  [recipient chips                          ]         |
| Subject: [                                       ]        |
+----------------------------------------------------------+
|                                                          |
|   [Rich text editor - Tiptap]                            |
|                                                          |
|   Formatting toolbar:                                    |
|   B I U S | H1 H2 | UL OL | Link | Image | Code | ""   |
|                                                          |
|                                                          |
|   -- Signature --                                        |
|   Best regards,                                          |
|   Alice                                                  |
+----------------------------------------------------------+
| [Attach files] | file1.pdf (2.3 MB) [x] | img.png [x]   |
+----------------------------------------------------------+
```

**Window modes:**
- **Inline**: Compose panel replaces reading pane (default)
- **Pop-out**: Separate floating dialog (draggable, resizable)
- **Full-screen**: Compose fills the entire content area
- **Minimized**: Collapsed bar at bottom showing subject + To (like Gmail)

**Multiple drafts:**
- Multiple compose windows can be open simultaneously
- Minimized drafts stack at the bottom of the screen
- Zustand store tracks all open drafts: `Map<draftId, DraftState>`

## Tasks

### 3.1 — Tiptap Rich Text Editor

Configure Tiptap with extensions for email-appropriate formatting.

**Extensions:**
- StarterKit (bold, italic, strike, headings, lists, blockquote, code, hard break)
- Link (with URL validation, auto-link detection)
- Underline
- TextAlign (left, center, right)
- Color + Highlight (text color, background color)
- Image (inline images, paste from clipboard)
- Table (basic table support for structured emails)
- Placeholder ("Write your message...")
- Typography (smart quotes, dashes)
- CharacterCount (optional, for display)

**Custom behaviors:**
- Tab key indents in lists, does not change focus
- Shift+Enter inserts line break, Enter inserts paragraph
- Paste from clipboard: strip Word/Google Docs cruft, keep formatting
- Paste image from clipboard: auto-upload as attachment, insert inline
- Drag-drop files onto editor: auto-upload as attachment

**HTML output:**
- Tiptap generates clean semantic HTML
- Email-safe CSS: inline styles for color/alignment (email clients ignore `<style>` blocks)
- On send, convert editor HTML → email-safe HTML (inline all styles)

**Acceptance Criteria:**
- [ ] All formatting options work: bold, italic, underline, strikethrough, headings (H1-H3), bullet list, numbered list, blockquote, code, link, text color, text align
- [ ] Paste from clipboard preserves formatting (strips unsafe elements)
- [ ] Paste image from clipboard uploads and inserts inline
- [ ] Link insertion: dialog with URL validation, auto-detect URLs while typing
- [ ] Editor responds instantly to typing (no lag even in long messages)
- [ ] HTML output is email-safe (inline styles, no CSS classes)
- [ ] Editor supports undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Placeholder text shows when editor is empty
- [ ] Editor height grows with content (min-height: 200px, max-height: 60vh with scroll)

### 3.2 — Recipient Input with Autocomplete

Custom input component for To/Cc/Bcc fields with contact autocomplete.

**Behavior:**
- Type to search contacts (JMAP Contact/query, debounced 200ms)
- Results dropdown shows: name + email, with avatar
- Select adds a "chip" (rounded pill showing name)
- Chips show email on hover, can be removed with backspace or X button
- Multiple emails can be pasted (comma/semicolon/newline separated)
- Invalid emails shown with red outline and tooltip
- Tab/Enter confirms the current input as a chip
- Recent contacts shown before typing (from localStorage cache)

**Autocomplete sources (prioritized):**
1. Recent recipients (localStorage, last 50)
2. JMAP Contacts (if contacts module is available)
3. Previous email senders (from message cache)

**Acceptance Criteria:**
- [ ] Autocomplete dropdown appears after 1 character typed
- [ ] Results show within 200ms (debounced search)
- [ ] Contact results show name + email + avatar
- [ ] Chip created on selecting result, pressing Enter, Tab, or comma
- [ ] Backspace deletes last chip when input is empty
- [ ] Paste multiple addresses creates multiple chips
- [ ] Invalid email addresses highlighted in red
- [ ] Keyboard navigation in dropdown (arrow keys + Enter)
- [ ] Recent contacts shown immediately on focus (before typing)
- [ ] Accessible: screen reader announces chip additions/removals

### 3.3 — Attachment Handling

Upload, display, and manage file attachments.

**Upload flow:**
1. User selects files via button or drag-and-drop onto compose area
2. Each file immediately starts uploading to `/api/blob/upload` (async, parallel)
3. Upload progress shown per file (progress bar on attachment chip)
4. On complete, `blobId` stored in draft state
5. Attachment chips show: file icon + name + size + progress/complete indicator + remove button

**Drag-and-drop:**
- Drag files anywhere onto the compose window
- Drop zone highlight on drag over (blue border + "Drop files to attach" overlay)
- Multiple files can be dropped at once
- Images dragged onto the editor body are inserted inline (not as attachments)

**Inline images:**
- Images can be inline (in body) or attached (in attachment bar)
- Paste from clipboard → inline by default
- Drag to editor → inline; drag to attachment bar → attachment
- Toggle between inline and attachment via right-click context menu

**File size limits:**
- Individual file: 25MB (configurable via backend)
- Total attachments per email: 25MB
- Show error toast if limit exceeded

**Forward with attachments:**
- When forwarding, original attachments are listed with checkboxes
- Checked attachments are included (default: all checked)
- Unchecked attachments are excluded
- Original attachment blobs are re-referenced (not re-uploaded)

**Acceptance Criteria:**
- [ ] File picker opens on "Attach" button click
- [ ] Drag-and-drop works on entire compose window
- [ ] Upload progress visible per file
- [ ] Parallel uploads (up to 3 concurrent)
- [ ] Upload cancellation (click X during upload aborts request)
- [ ] File size validation (individual and total) with clear error message
- [ ] Image paste from clipboard inserts inline
- [ ] Forward includes original attachments with toggle
- [ ] Attachment chips show file type icon + name + formatted size
- [ ] Remove attachment removes from draft and cancels upload if in progress

### 3.4 — Draft Auto-Save

Automatically save compose drafts to the server asynchronously.

**Strategy:**
- Auto-save fires 3 seconds after last keystroke (debounced)
- Uses JMAP `Email/set` to create/update draft in Drafts mailbox
- Draft has `keywords.$draft: true`
- Save indicator in compose toolbar: "Saving..." → "Saved at 2:30 PM"
- On compose open from existing draft, load full draft state
- On send, the draft is destroyed (JMAP `Email/set` destroy)

**Draft state (Zustand store):**
```typescript
interface DraftState {
  draftId: string;           // client-generated UUID
  emailId?: string;          // JMAP Email ID (set after first server save)
  from: Identity;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  bodyHTML: string;
  bodyText: string;
  attachments: Attachment[]; // {blobId, name, type, size, progress}
  inReplyTo?: string;        // Message-ID header for threading
  references?: string[];     // References header chain
  isDirty: boolean;
  lastSaved?: Date;
  saving: boolean;
}
```

**Offline resilience:**
- If auto-save fails (network error), draft persists in Zustand (memory) and retries on next trigger
- On page unload with unsaved draft: `beforeunload` event warns user
- LocalStorage backup of draft metadata (not body — too large) as crash recovery hint

**Acceptance Criteria:**
- [ ] Auto-save triggers 3 seconds after last edit
- [ ] Save indicator shows saving/saved status with timestamp
- [ ] Draft appears in Drafts folder after first save
- [ ] Reopening a draft restores all fields (to, cc, subject, body, attachments)
- [ ] Sending destroys the draft from Drafts folder
- [ ] Discarding compose shows confirmation if unsaved changes, then destroys draft
- [ ] Page unload with unsaved draft shows browser confirmation
- [ ] Auto-save failure retries silently, shows error after 3 consecutive failures
- [ ] Multiple drafts can be saved independently

### 3.5 — Send Email

Submit the composed email via JMAP `EmailSubmission/set`.

**Send flow:**
1. Validate: at least one recipient, subject (warn if empty), body (warn if empty)
2. Convert Tiptap HTML to email-safe HTML (inline CSS styles)
3. Create/update Email object with final body and attachments via `Email/set`
4. Create EmailSubmission via `EmailSubmission/set` with `onSuccessUpdateEmail` to move from Drafts to Sent
5. On success: close compose, show "Message sent" toast with undo option
6. On failure: show error toast, keep compose open

**Undo send:**
- Configurable delay: 0s (disabled), 5s, 10s, 30s (stored in settings)
- During delay, the EmailSubmission is created but the UI shows "Sending... [Undo]" toast
- Undo cancels the submission (JMAP `EmailSubmission/set` destroy if still pending)
- After delay expires, submission proceeds
- If Stalwart has already sent (instant delivery), undo is no longer possible — toast changes to "Message sent"

**Identity selection:**
- If user has multiple JMAP Identities (multiple email addresses), show From dropdown
- Default identity is configurable in settings

**Acceptance Criteria:**
- [ ] Send validates recipients present (error toast if missing)
- [ ] Empty subject/body shows "Send without subject/body?" confirmation
- [ ] Send converts editor HTML to email-safe format
- [ ] Sent email appears in Sent folder
- [ ] Reply/reply-all correctly sets In-Reply-To and References headers for threading
- [ ] Forward includes attached files
- [ ] Send button shows loading state during submission
- [ ] Undo send works within configured delay
- [ ] Failed send keeps compose open with error message
- [ ] Multiple identity support (From dropdown)
- [ ] Send keyboard shortcut: Ctrl+Enter / Cmd+Enter

### 3.6 — Signatures

Per-identity HTML signatures appended to compose body.

**Signature management (in Settings):**
- Create/edit/delete signatures
- Rich text editor for signature content (reuse Tiptap)
- Assign default signature per identity
- Option: "Include signature in replies" (default: yes, placed above quoted text)

**Signature storage — JMAP Identity:**

JMAP Identity objects (`urn:ietf:params:jmap:submission`) have built-in signature fields:
- `textSignature` — plain text signature
- `htmlSignature` — HTML signature

Signatures are stored server-side in Stalwart via `Identity/set`, which means they roam
across devices and browsers automatically. No localStorage, no extra database.

```typescript
// Read signatures
["Identity/get", {
  accountId: "...",
  properties: ["id", "name", "email", "textSignature", "htmlSignature"]
}, "0"]

// Update signature for an identity
["Identity/set", {
  accountId: "...",
  update: {
    "identity-id": {
      htmlSignature: "<p>Best regards,<br>Alice</p>",
      textSignature: "Best regards,\nAlice"
    }
  }
}, "0"]
```

The settings UI edits signatures via Tiptap and saves both `htmlSignature` (Tiptap output)
and `textSignature` (stripped plaintext) to the Identity.

**Signature insertion:**
- On new compose: insert the active identity's `htmlSignature` at bottom
- On reply/forward: insert above quoted text, separated by `-- \n` (sig separator)
- Signature is editable in compose (it's just part of the body)
- Switching identity swaps signature (with confirmation if body was edited)

**Acceptance Criteria:**
- [ ] Signatures stored in JMAP Identity (server-side, roams across devices)
- [ ] Signatures configurable in settings with rich text editor
- [ ] Both htmlSignature and textSignature saved (for plaintext recipients)
- [ ] Default signature auto-inserted in new compose
- [ ] Signature placed above quoted text in replies
- [ ] Switching identity swaps signature
- [ ] Signature separator (`-- `) included for standard clients
- [ ] Signature available immediately on any device after login (no sync delay)
