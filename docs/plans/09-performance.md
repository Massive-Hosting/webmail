# Performance Plan

## Goal

The webmail must feel faster than native desktop email clients. Every interaction should complete within the user's perception threshold. This document defines performance budgets, strategies, and measurement criteria.

## Performance Budgets

### Page Load

| Metric | Budget | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | <800ms | Lighthouse, first paint of content |
| Largest Contentful Paint (LCP) | <1.2s | Lighthouse, largest visible element |
| Time to Interactive (TTI) | <1.5s | Lighthouse, main thread idle |
| Cumulative Layout Shift (CLS) | <0.05 | Lighthouse, visual stability |
| First Input Delay (FID) | <50ms | Real user monitoring |
| Total Blocking Time (TBT) | <150ms | Lighthouse, main thread blocking |

### Bundle Size

| Bundle | Budget (gzipped) | Contents |
|--------|------------------|----------|
| Initial (critical path) | <150KB | React, Router, core layout, auth |
| Mail module (lazy) | <100KB | Message list, reading pane, compose |
| Tiptap editor (lazy) | <80KB | Rich text editor + extensions |
| Contacts module (lazy) | <40KB | Contact list, detail, autocomplete |
| Calendar module (lazy) | <60KB | Calendar views, event form |
| Total (all modules) | <430KB | Everything loaded |

### Runtime

| Interaction | Budget | Strategy |
|-------------|--------|----------|
| Message list scroll | 60fps (16.6ms/frame) | TanStack Virtual, fixed heights |
| Click message → show content | <100ms | Prefetch on hover, optimistic cache |
| Star / archive / delete action | <50ms visual feedback | Optimistic update, no server wait |
| Folder switch | <200ms to show messages | Cache + prefetch |
| Compose window open | <150ms | Lazy-load editor on first compose |
| Search results appear | <500ms | JMAP server-side search |
| Contact autocomplete | <100ms | Client-side cache search |
| Send email | <200ms to close compose | Async submission |
| WebSocket message → UI update | <100ms | Direct cache invalidation |

### Backend

| Metric | Budget |
|--------|--------|
| JMAP proxy latency (p50) | <50ms |
| JMAP proxy latency (p99) | <200ms |
| Login latency (p50) | <100ms |
| Blob upload (10MB, p50) | <2s |
| Blob download (10MB, p50) | <1s |
| WebSocket message relay | <20ms |
| Memory per connection | <50KB |
| Concurrent WebSocket connections | 10,000+ per instance |

## Strategies

### 1. Code Splitting

Route-based code splitting with React.lazy:

```typescript
// Routes are lazy-loaded
const MailView = lazy(() => import('./routes/mail'));
const ContactsView = lazy(() => import('./routes/contacts'));
const CalendarView = lazy(() => import('./routes/calendar'));
const SettingsView = lazy(() => import('./routes/settings'));

// Heavy components lazy-loaded on demand
const ComposeDialog = lazy(() => import('./components/mail/compose/compose-dialog'));
const TiptapEditor = lazy(() => import('./components/mail/compose/editor'));
```

**Loading strategy:**
1. Initial load: app shell, sidebar, message list (critical path)
2. On first compose: load Tiptap editor bundle
3. On navigate to Contacts: load contacts bundle
4. On navigate to Calendar: load calendar bundle
5. Prefetch non-critical bundles during idle time (`requestIdleCallback`)

### 2. Virtual Scrolling

TanStack Virtual for all long lists:

**Message list:**
- Fixed row height: 72px
- Overscan: 10 rows
- Window scroll (not container scroll — better mobile behavior)
- Measure only visible + overscan rows

**Contact list:**
- Fixed row height: 56px
- Section headers (A, B, C) as variable-height sticky headers
- Jump-to-letter scroll index

**Calendar day/week view:**
- Fixed row height: 48px (30min slot)
- Scroll to current time on mount

**Performance guard:**
- Never render >200 DOM nodes for a list
- List items are pure components (React.memo with shallow comparison)
- Avoid re-renders on scroll (only render/unmount rows entering/leaving viewport)

### 3. JMAP Request Optimization

**Batch requests:**
Every user interaction should produce at most one HTTP request. Use JMAP's method call batching:

```typescript
// Single request that fetches mailboxes + first page of inbox
{
  methodCalls: [
    ["Mailbox/get", { accountId, properties: ["id","name","role","unreadEmails","totalEmails"] }, "a"],
    ["Email/query", { accountId, filter: {inMailbox: inboxId}, sort: [{property:"receivedAt",isAscending:false}], limit: 50 }, "b"],
    ["Email/get", { accountId, "#ids": {resultOf:"b",name:"Email/query",path:"/ids"}, properties: ["id","threadId","from","subject","receivedAt","preview","keywords","hasAttachment","size"] }, "c"]
  ]
}
```

**Property optimization:**
- List view: fetch only display properties (id, from, subject, preview, date, keywords)
- Detail view: fetch full properties on demand (body, attachments, headers)
- Never fetch `bodyValues` in list queries

**Delta sync:**
- Store `state` from every response
- Use `*/changes` + back-references for incremental updates
- Full resync only when state gap is too large (server returns `cannotCalculateChanges`)

**Connection pooling (backend):**
- Go HTTP client with persistent connections to Stalwart
- MaxIdleConns: 100
- MaxConnsPerHost: 50
- IdleConnTimeout: 90s
- TLS session reuse

### 4. Caching Strategy

**TanStack Query cache configuration:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,       // 2 minutes — data considered fresh
      gcTime: 30 * 60 * 1000,          // 30 minutes — cached data retained
      refetchOnWindowFocus: true,       // refetch when tab regains focus
      refetchOnReconnect: true,         // refetch after network recovery
      refetchIntervalInBackground: false, // don't poll hidden tabs
      retry: 2,                         // retry failed requests twice
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  },
});
```

**Cache key structure:**
```
["mailboxes"]                          → all mailboxes with counts
["emails", mailboxId, sortOrder]       → message list for a mailbox
["email", emailId]                     → single email (list properties)
["email", emailId, "full"]             → single email (full body + attachments)
["thread", threadId]                   → thread with all message IDs
["contacts"]                           → all contacts (small lists <1000)
["contacts", "search", query]          → contact search results
["calendar-events", calendarId, range] → events for a date range
```

**Prefetching:**
- Hover over message (150ms): prefetch full body
- Load mailbox: prefetch first 5 message bodies
- Idle time: prefetch top 3 folders' message lists
- Navigate to contacts/calendar: prefetch on idle before first visit

### 5. Rendering Optimization

**React optimizations:**
- `React.memo` on all list item components with custom comparators
- `useMemo` for expensive computations (date formatting, HTML sanitization)
- `useCallback` for event handlers passed to child components
- Avoid inline object/array props (cause unnecessary re-renders)
- Use `key` prop correctly (stable IDs, never array indices)

**CSS optimizations:**
- `will-change: transform` on panes during resize
- `contain: content` on message list items (layout isolation)
- Avoid layout thrashing (batch DOM reads/writes)
- Hardware-accelerated animations only (transform, opacity)

**HTML email rendering:**
- DOMPurify sanitization: <5ms for typical emails
- Lazy-sanitize long emails (sanitize first screen, queue rest)
- External image placeholders are lightweight (no network until user clicks)
- Quote collapsing reduces initial DOM size

### 6. Network Optimization

**HTTP/2 multiplexing:**
- All API calls over single HTTP/2 connection
- No head-of-line blocking for parallel requests
- Server push for critical resources (if nginx configured)

**Compression:**
- gzip/brotli on all API responses (nginx-level)
- Brotli for static assets (vite build produces .br files)
- JMAP responses are JSON — compress well (typically 80%+ reduction)

**Request deduplication:**
- TanStack Query deduplicates identical in-flight requests automatically
- Custom deduplication for WebSocket-triggered refetches (debounce 100ms)

### 7. WebSocket Performance

**Connection efficiency:**
- Single WebSocket per tab (multiplexes all event types)
- Binary protocol considered but JSON sufficient (small messages, <200 bytes)
- Heartbeat: 30s interval, minimal overhead
- Reconnect backoff prevents thundering herd

**Message processing:**
- WebSocket messages processed asynchronously (don't block UI thread)
- Batch state change notifications (if multiple arrive within 100ms, process once)
- Cache invalidation is key-targeted (don't invalidate unrelated queries)

### 8. Backend Performance

**Go optimizations:**
- `sync.Pool` for JSON encoder/decoder instances
- Response streaming for large JMAP responses (don't buffer in memory)
- Connection pooling to Stalwart (see above)
- Goroutine-per-WebSocket with efficient blocking (no busy-wait)

**Memory management:**
- Attachment streaming: pipe request body → Stalwart, never buffer full file
- JMAP proxy: stream response body, don't deserialize unless validation needed
- Session cookie: <512 bytes per cookie (no per-session server memory)

**Concurrency:**
- WebSocket hub with lock-free broadcast (channels)
- Rate limiter with sharded counters (reduce contention)
- Metrics with `prometheus/client_golang` (lock-free atomic operations)

## Measurement & Monitoring

### Development
- Lighthouse CI in PR checks (fail if budget exceeded)
- Bundle analyzer (rollup-plugin-visualizer) to track bundle composition
- React DevTools Profiler for render performance
- Chrome Performance tab for scroll/animation profiling

### Production
- Prometheus metrics for backend latency (histograms with p50/p95/p99)
- Web Vitals library reporting FCP, LCP, CLS, FID to backend
- Grafana dashboard: API latency, WebSocket connections, cache hit rates
- Alert on p99 latency >500ms or error rate >1%

### Load Testing
- k6 script simulating realistic email workload:
  - 1000 concurrent users
  - Mix: 70% read, 15% compose, 10% search, 5% calendar
  - Target: p99 <200ms for reads, <500ms for writes
- WebSocket load test: 10,000 concurrent connections, 1 message/second broadcast

**Acceptance Criteria:**
- [ ] All page load budgets met on 3G throttled connection
- [ ] Message list scrolls at 60fps with 10,000 messages
- [ ] Bundle size within budget (measured per-route)
- [ ] No memory leaks over 1-hour session (monitored via DevTools)
- [ ] Backend handles 10,000 concurrent WebSocket connections
- [ ] JMAP proxy p99 latency <200ms under load
- [ ] Prefetching reduces perceived message open time to <100ms
- [ ] Delta sync reduces bandwidth by >80% vs full refetch
