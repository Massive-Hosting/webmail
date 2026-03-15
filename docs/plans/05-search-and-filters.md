# Phase 4 — Search & Filter Rules

## Goal

Provide fast, comprehensive email search using JMAP's built-in query capabilities, plus a UI for managing server-side Sieve filter rules. Search should feel as fast as Gmail — instant results as you type, with structured query support for power users.

## Prerequisites

- Phase 2 (Core Mail UI) complete

## Search

### Search Bar

Always visible in the toolbar. Click or press `/` to focus.

**Basic search:**
- Type a query, results appear as you type (debounced 300ms)
- Searches across: from, to, subject, body text
- JMAP method: `Email/query` with `filter: { text: "query" }`
- Results displayed in the message list pane (replaces current mailbox view)
- "Search results for: query" header above results
- Press Esc or click X to clear search and return to mailbox

**Structured search syntax:**
Parse structured queries client-side and convert to JMAP filters:

| Syntax | JMAP Filter Property | Example |
|--------|---------------------|---------|
| `from:` | `from` | `from:alice@example.com` |
| `to:` | `to` | `to:bob@company.com` |
| `subject:` | `subject` | `subject:quarterly report` |
| `has:attachment` | `hasAttachment: true` | `has:attachment` |
| `has:star` | `hasKeyword: "$flagged"` | `has:star` |
| `is:unread` | `notKeyword: "$seen"` | `is:unread` |
| `is:read` | `hasKeyword: "$seen"` | `is:read` |
| `in:` | `inMailbox` (by name lookup) | `in:sent` |
| `before:` | `before` (UTC datetime) | `before:2026-01-01` |
| `after:` | `after` (UTC datetime) | `after:2026-03-01` |
| `larger:` | `minSize` (bytes) | `larger:5mb` |
| `smaller:` | `maxSize` (bytes) | `smaller:100kb` |
| bare words | `text` (full-text) | `quarterly report` |

Multiple terms are combined with AND. Example:
```
from:alice has:attachment after:2026-01-01 budget
```
→ JMAP filter:
```json
{
  "operator": "AND",
  "conditions": [
    { "from": "alice" },
    { "hasAttachment": true },
    { "after": "2026-01-01T00:00:00Z" },
    { "text": "budget" }
  ]
}
```

**Search suggestions:**
- As user types, show dropdown with:
  - Structured search hints (e.g., typing "from:" shows "from: — Search by sender")
  - Recent searches (localStorage, last 20)
  - Matching contacts for `from:` and `to:` prefixes

**Advanced search dialog:**
- Accessible via "Advanced" link in search bar or keyboard shortcut
- Form-based filter builder with fields for each search property
- Date range picker for before/after
- Mailbox selector dropdown
- Submit converts to structured query string

### Search Results

- Results display in the same message list component (reused)
- Sort options: Relevance (default), Date newest, Date oldest
- Highlight matching terms in subject and preview (bold or yellow highlight)
- Result count shown: "42 results"
- Pagination via infinite scroll (same as mailbox view)
- Actions available on search results (reply, star, move, delete)
- Click result to view in reading pane

**Acceptance Criteria:**
- [ ] Basic text search returns results within 500ms
- [ ] Structured syntax parsed correctly for all operators in table
- [ ] Invalid syntax gracefully ignored (treated as plain text)
- [ ] Search suggestions dropdown with recent searches and operators
- [ ] Advanced search dialog with form fields
- [ ] Results reuse message list component with full functionality
- [ ] Search clears on Esc or X button
- [ ] Search works across all mailboxes (not scoped to current)
- [ ] Option to scope search to current mailbox (checkbox)
- [ ] Matching terms highlighted in results
- [ ] Empty results show "No messages found" with search tips

## Filter Rules (Sieve)

Server-side rules that automatically process incoming mail. The platform already generates Sieve scripts for forwards — the webmail extends this with user-defined rules.

### Rule Model

```typescript
interface FilterRule {
  id: string;
  name: string;
  enabled: boolean;
  order: number;          // execution priority
  conditions: FilterCondition[];
  conditionMatch: "all" | "any"; // AND vs OR
  actions: FilterAction[];
}

interface FilterCondition {
  field: "from" | "to" | "cc" | "subject" | "body" | "size" | "hasAttachment";
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "regex" | "greaterThan" | "lessThan";
  value: string;
}

interface FilterAction {
  type: "moveTo" | "copyTo" | "markRead" | "star" | "forward" | "delete" | "reject";
  value?: string; // mailbox ID for moveTo/copyTo, email for forward
}
```

### Rule Management UI

Settings → Filters page:

```
+----------------------------------------------------------+
| Filter Rules                                    [+ New]  |
+----------------------------------------------------------+
| ☰ 1. Newsletters → Archive         [enabled] [edit] [x] |
| ☰ 2. GitHub notifications → GitHub  [enabled] [edit] [x] |
| ☰ 3. Large attachments → Flag       [off]    [edit] [x] |
+----------------------------------------------------------+
```

- Drag handle (☰) to reorder rules
- Toggle switch to enable/disable without deleting
- Edit opens rule editor dialog
- Delete with confirmation

### Rule Editor Dialog

```
+----------------------------------------------------------+
| Edit Rule: "Newsletters"                                  |
+----------------------------------------------------------+
| When [all v] of these conditions are met:                 |
|                                                          |
| [From    v] [contains v] [newsletter        ] [- ] [+]  |
| [Subject v] [contains v] [unsubscribe       ] [- ] [+]  |
|                                                          |
| Do the following:                                        |
|                                                          |
| [Move to     v] [Archive           v] [- ] [+]          |
| [Mark as read v]                      [- ] [+]          |
|                                                          |
| [x] Apply to existing messages (run retroactively)       |
|                                                          |
|                              [Cancel]  [Save]            |
+----------------------------------------------------------+
```

### Sieve Script Generation

Rules are compiled to a Sieve script and deployed via JMAP `SieveScript/set` (through the JMAP proxy, which allows Sieve for user scripts). The script is named `webmail-filters` and coexists with the platform's `hosting-forwards` script via `include :personal` composition (see `12-hosting-platform-changes.md` section 3).

```sieve
require ["fileinto", "copy", "flag", "reject", "body"];

# Rule: Newsletters (id: rule1)
if allof (
  header :contains "From" "newsletter",
  header :contains "Subject" "unsubscribe"
) {
  fileinto "Archive";
  addflag "\\Seen";
  stop;
}

# Rule: Large attachments (id: rule3, disabled)
# if anyof (
#   size :over 5M
# ) {
#   addflag "\\Flagged";
# }
```

Disabled rules are included as comments (for round-trip preservation).

### Retroactive Filter Application

When "Apply to existing messages" is checked, a Temporal workflow processes existing messages:

```
Workflow: ApplyFilterRetroactiveWorkflow
Input: {accountId, stalwartURL, adminToken, rule: FilterRule}
Steps:
  1. Build JMAP filter from rule conditions
  2. Query matching emails via Email/query (paginated)
  3. For each batch of 50 matching emails:
     a. Apply rule actions via Email/set
     b. Report progress via WebSocket
  4. Return summary
```

**Acceptance Criteria:**
- [ ] Rules CRUD: create, read, update, delete, reorder
- [ ] Rule editor validates conditions and actions
- [ ] Sieve script generated correctly from rules
- [ ] Sieve script deployed via existing JMAP DeploySieveScript
- [ ] Disabled rules preserved as comments in Sieve
- [ ] Rule ordering determines Sieve execution priority
- [ ] Retroactive application works via Temporal with progress
- [ ] Platform's `hosting-forwards` script is not affected (separate script name)
- [ ] Rules persist across sessions (stored server-side in Sieve)
- [ ] Round-trip: rules can be reconstructed from Sieve script on load
- [ ] Test rule: "Test" button shows matching messages without applying
