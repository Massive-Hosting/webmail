# Phase 2.5 — Real-Time & Async Architecture

## Goal

Replace polling with WebSocket-driven real-time updates. Use Temporal for any operation that is long-running, can fail, or benefits from retry logic. The user should never see a spinner longer than 200ms for routine operations, and should receive live updates for everything happening in the background.

## WebSocket Architecture

```
Browser                       Webmail API (Go)              Stalwart
  |                               |                            |
  |-- WS /api/ws --------------> |                            |
  |   (authenticated via cookie)  |                            |
  |                               |-- JMAP EventSource -----> |
  |                               |   (SSE: state changes)    |
  |                               |<-- {type: "Email"} -------|
  |<-- {type: "stateChange",     |                            |
  |      changed: {Email: "s2"}} |                            |
  |                               |                            |
  |-- (invalidate query cache) -> |                            |
  |-- Email/get (delta) -------> |                            |
```

### How It Works

1. **Browser opens WebSocket** to `/api/ws` on page load (authenticated via session cookie)
2. **Go backend subscribes** to Stalwart's JMAP EventSource (Server-Sent Events) for the user's account
3. **Stalwart pushes state changes** (e.g., `Email` state changed, `Mailbox` state changed)
4. **Go backend forwards** these as WebSocket messages to the browser
5. **Browser invalidates** the relevant TanStack Query cache keys, triggering a delta refetch
6. **Delta refetch** uses JMAP `Email/changes` or `Mailbox/changes` to fetch only what changed (not full re-query)

### WebSocket Message Types

```typescript
// Server → Client
type WSMessage =
  | { type: "stateChange"; changed: Record<string, string> }
  // changed maps JMAP type name → new state string
  // e.g. { "Email": "state123", "Mailbox": "state456" }
  | { type: "ping" }
  | { type: "error"; message: string }

// Client → Server
type WSClientMessage =
  | { type: "pong" }
```

### Connection Management

- **Reconnect with exponential backoff**: 1s → 2s → 4s → 8s → max 30s
- **Heartbeat**: Server sends `ping` every 30s, client responds `pong`. If no pong in 10s, server closes connection
- **Visibility API**: When tab becomes hidden, downgrade to polling (60s interval). When tab becomes visible, reconnect WebSocket immediately
- **Multiple tabs**: Each tab has its own WebSocket (shared worker is a future optimization). State changes received on any tab are fine — they invalidate independent caches
- **Graceful degradation**: If WebSocket fails to connect after 3 attempts, fall back to polling. Show subtle indicator ("Live updates unavailable") in toolbar

## JMAP Delta Sync

JMAP has built-in delta sync via `*/changes` methods. This is critical for performance — instead of re-fetching entire mailbox contents, we only fetch what changed.

**Flow:**
1. Store `state` from every `Email/get` and `Mailbox/get` response
2. When WebSocket notifies of state change, call `Email/changes` with `sinceState`
3. Response contains `created`, `updated`, `destroyed` arrays of IDs
4. Fetch full objects only for `created` and `updated` IDs
5. Remove `destroyed` IDs from cache

```typescript
// Example: Email/changes request
{
  using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
  methodCalls: [
    ["Email/changes", {
      accountId: "...",
      sinceState: "previousState123"
    }, "0"],
    // Back-reference: fetch full objects for changed IDs
    ["Email/get", {
      accountId: "...",
      "#ids": { resultOf: "0", name: "Email/changes", path: "/created" },
      properties: ["id", "threadId", "mailboxIds", "from", "subject", ...]
    }, "1"],
    ["Email/get", {
      accountId: "...",
      "#ids": { resultOf: "0", name: "Email/changes", path: "/updated" },
      properties: ["id", "threadId", "mailboxIds", "from", "subject", ...]
    }, "2"]
  ]
}
```

**Acceptance Criteria:**
- [ ] WebSocket connection established on login, maintained throughout session
- [ ] New emails appear in message list within 2 seconds of delivery (no manual refresh)
- [ ] Unread counts update within 2 seconds via delta sync
- [ ] Read/star/move actions from other clients (IMAP, mobile) reflected within 2 seconds
- [ ] Reconnect with exponential backoff on disconnect
- [ ] Falls back to 60s polling if WebSocket unavailable
- [ ] Connection pauses when tab is hidden (Visibility API)
- [ ] Delta sync uses `*/changes` — never re-fetches entire mailbox
- [ ] Multiple concurrent tabs each maintain their own connection without conflicts

## Temporal for Long-Running Operations

Most webmail operations are instant JMAP calls. But some operations are inherently long-running, can partially fail, or benefit from Temporal's retry and visibility:

### Operations That Use Temporal

**1. Bulk Delete / Bulk Move (>100 messages)**
- JMAP has per-request limits. Moving 5,000 messages requires multiple batched `Email/set` calls
- Temporal workflow batches into chunks of 50, with retry per batch
- WebSocket pushes progress updates to the browser

```
Workflow: BulkEmailActionWorkflow
Input: {accountId, emailIds, action: "move"|"delete"|"markRead", targetMailboxId?}
Steps:
  1. Validate total count, chunk into batches of 50
  2. For each batch:
     a. Execute JMAP Email/set
     b. Report progress via WebSocket (sent through a side channel)
     c. Retry on transient failure (up to 3 attempts per batch)
  3. Return summary: {succeeded, failed, errors}
```

**2. Mailbox Export**
- Export entire mailbox as .mbox or .zip of .eml files
- Streams through Stalwart's JMAP Blob/get for each message
- Produces a downloadable archive, stored as a temporary file on the webmail API server
- Download link sent via WebSocket when complete, expires after 1 hour

```
Workflow: ExportMailboxWorkflow
Input: {accountId, mailboxId, format: "mbox"|"zip-eml"}
Steps:
  1. Query all email IDs in mailbox
  2. Fetch each email's raw RFC822 content via JMAP
  3. Stream into archive format, write to temp file
  4. Return download token via WebSocket notification
  5. User downloads via GET /api/export/{token} (serves temp file, deletes after download)
```

**3. Bulk Import (.mbox / .eml files)**
- Upload large .mbox file, parse into individual messages
- Each message imported via JMAP Email/import
- Progress updates via WebSocket

```
Workflow: ImportMailboxWorkflow
Input: {accountId, mailboxId, blobId (uploaded .mbox file)}
Steps:
  1. Download blob, parse .mbox format
  2. For each message:
     a. Upload as blob via JMAP
     b. Import via Email/import
     c. Report progress
  3. Return summary: {imported, skipped, failed}
```

**4. Apply Sieve Filter Retroactively**
- When user creates a new filter rule, optionally apply it to existing messages
- Scans matching messages and moves them according to the rule

```
Workflow: ApplyFilterRetroactiveWorkflow
Input: {accountId, filter: JMAPFilter, action: "move"|"flag"|"markRead", targetMailboxId?}
Steps:
  1. Query matching emails via Email/query
  2. Apply action in batches of 50
  3. Report progress via WebSocket
```

### Progress Reporting via WebSocket

Temporal workflows report progress to the browser through a side channel:

```
Temporal Activity → Redis/Valkey pub/sub → Go WebSocket handler → Browser
```

The Go WebSocket handler subscribes to a Valkey channel keyed by `webmail:progress:{accountId}`. Temporal activities publish progress events to this channel.

```typescript
// WebSocket progress message
{
  type: "taskProgress",
  taskId: "workflow-run-id",
  taskType: "bulkMove",
  progress: 0.65,        // 0.0 to 1.0
  detail: "Moved 325 of 500 messages",
  status: "running"      // "running" | "completed" | "failed"
}
```

**Frontend rendering:**
- Active tasks show in a "Tasks" tray at bottom of screen (like VS Code's panel)
- Each task: progress bar + description + cancel button
- Completed tasks auto-dismiss after 5 seconds
- Failed tasks persist with retry button

**Acceptance Criteria:**
- [ ] Bulk operations (>100 messages) routed through Temporal, not direct JMAP
- [ ] Progress bar updates in real-time via WebSocket
- [ ] Failed batches retry automatically (3 attempts)
- [ ] User can cancel in-progress bulk operations
- [ ] Export produces downloadable archive with working download link
- [ ] Import handles .mbox and individual .eml files
- [ ] Task tray shows all active/recent background operations
- [ ] Completed tasks can be dismissed

## Async UI Patterns

### Optimistic Updates (Every Mutation)

Every user-initiated action updates the UI immediately, before the server responds:

```typescript
// Example: Star a message
const starMessage = useMutation({
  mutationFn: (emailId: string) =>
    jmapEmailSet(emailId, { "keywords/$flagged": true }),
  onMutate: async (emailId) => {
    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ["emails", mailboxId] });
    // Snapshot previous state
    const previous = queryClient.getQueryData(["emails", mailboxId]);
    // Optimistically update
    queryClient.setQueryData(["emails", mailboxId], (old) =>
      old.map(e => e.id === emailId ? { ...e, keywords: { ...e.keywords, "$flagged": true } } : e)
    );
    return { previous };
  },
  onError: (err, emailId, context) => {
    // Revert on failure
    queryClient.setQueryData(["emails", mailboxId], context.previous);
    toast.error("Failed to star message", { action: { label: "Retry", onClick: () => starMessage.mutate(emailId) } });
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
  },
});
```

### Request Batching

Multiple JMAP method calls are batched into a single HTTP request when possible:

```typescript
// Instead of 3 separate requests:
// Email/query + Email/get + Mailbox/get

// Single batched JMAP request:
{
  using: [...],
  methodCalls: [
    ["Mailbox/get", { accountId, properties: [...] }, "a"],
    ["Email/query", { accountId, filter: { inMailbox }, sort: [...], limit: 50 }, "b"],
    ["Email/get", { accountId, "#ids": { resultOf: "b", name: "Email/query", path: "/ids" }, properties: [...] }, "c"]
  ]
}
```

TanStack Query's `queryFn` implementations should batch related calls using JMAP's built-in back-references.

### Prefetching

- **Hover prefetch**: When cursor hovers over a message for 150ms, prefetch its full body
- **Adjacent prefetch**: After loading a mailbox, prefetch the first 10 message bodies
- **Folder prefetch**: Prefetch top folders' message lists during idle time

```typescript
// Hover prefetch
const prefetchMessage = (emailId: string) => {
  queryClient.prefetchQuery({
    queryKey: ["email", emailId, "full"],
    queryFn: () => fetchEmailFull(emailId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
```

**Acceptance Criteria:**
- [ ] Every mutation (star, move, delete, read) uses optimistic updates
- [ ] Failed mutations revert with error toast + retry action
- [ ] JMAP requests batched where possible (max 1 HTTP request per user interaction)
- [ ] Message bodies prefetched on hover (150ms debounce)
- [ ] Top folder counts prefetched on idle
- [ ] Request deduplication: identical in-flight requests are not duplicated
