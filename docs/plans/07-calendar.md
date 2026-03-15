# Phase 6 — Calendar

## Goal

A full calendar integrated with the mail experience. Calendar data lives in Stalwart via JMAP Calendars. The calendar handles event CRUD, recurring events, invitations (iCalendar), and shows today's agenda alongside the inbox.

## Prerequisites

- Phase 5 (Contacts) complete

## JMAP Calendars Overview

Stalwart supports JMAP Calendars. Key types:

- **CalendarEvent**: An event with title, start, end, location, recurrence, attendees, alerts
- **Calendar**: A collection of events (default + custom calendars, each with a color)
- **ParticipantIdentity**: The user's calendar identities for sending invitations

Capabilities: `urn:ietf:params:jmap:calendars`

## Calendar Views

Navigation: Click "Calendar" in sidebar.

### Month View
```
+----------------------------------------------------------+
| < March 2026 >                   [Month] [Week] [Day]    |
+----------------------------------------------------------+
| Mon   Tue   Wed   Thu   Fri   Sat   Sun                  |
+------+------+------+------+------+------+------+         |
|      |      |      |      |      |      | 1    |         |
+------+------+------+------+------+------+------+         |
| 2    | 3    | 4    | 5    | 6    | 7    | 8    |         |
|      |Sprint|      |      |      |      |      |         |
|      |Review|      |      |      |      |      |         |
+------+------+------+------+------+------+------+         |
| ...                                                      |
+----------------------------------------------------------+
```

### Week View
```
+----------------------------------------------------------+
| < Week 11, 2026 >                [Month] [Week] [Day]    |
+------+------+------+------+------+------+------+---------+
|      | Mon  | Tue  | Wed  | Thu  | Fri  | Sat  | Sun     |
| 8am  |      |      |      |      |      |      |         |
| 9am  |██████|      |      |      |      |      |         |
| 10am |Sprint|      |      |██████|      |      |         |
| 11am |Review|      |      |Design|      |      |         |
| 12pm |      |      |      |Review|      |      |         |
| 1pm  |      |      |      |      |      |      |         |
| ...  |      |      |      |      |      |      |         |
+------+------+------+------+------+------+------+---------+
```

### Day View
```
+----------------------------------------------------------+
| < Saturday, March 14, 2026 >     [Month] [Week] [Day]    |
+----------------------------------------------------------+
| 8:00  |                                                  |
| 9:00  | ████████████████████████████████████             |
| 10:00 | Sprint Review                                    |
|       | Conference Room A                                |
| 11:00 | ████████████████████████████████████             |
| 12:00 |                                                  |
| ...                                                      |
+----------------------------------------------------------+
```

## Tasks

### 6.1 — Calendar JMAP Integration

API layer for JMAP Calendar operations.

**Methods used:**
- `CalendarEvent/get` — fetch events
- `CalendarEvent/query` — query events by date range
- `CalendarEvent/set` — create, update, delete events
- `Calendar/get` — list calendars
- `Calendar/set` — create, update, delete calendars

**Event properties:**
```typescript
interface CalendarEvent {
  id: string;
  calendarIds: Record<string, boolean>;
  title: string;
  description?: string;
  descriptionContentType?: string;
  location?: string;
  locations?: Record<string, { name?: string; description?: string }>;
  start: string;          // LocalDateTime "2026-03-14T09:00:00"
  timeZone?: string;      // "America/New_York"
  duration?: string;      // "PT1H30M" (ISO 8601 duration)
  isAllDay?: boolean;     // computed from showWithoutTime
  showWithoutTime?: boolean;
  status?: "confirmed" | "tentative" | "cancelled";
  freeBusyStatus?: "busy" | "free" | "tentative";
  recurrenceRules?: RecurrenceRule[];
  recurrenceOverrides?: Record<string, Partial<CalendarEvent>>;
  excludedRecurrenceRules?: RecurrenceRule[];
  participants?: Record<string, Participant>;
  replyTo?: Record<string, string>;
  alerts?: Record<string, Alert>;
  color?: string;
  useDefaultAlerts?: boolean;
}

interface RecurrenceRule {
  frequency: "yearly" | "monthly" | "weekly" | "daily";
  interval?: number;
  until?: string;
  count?: number;
  byDay?: Array<{ day: string; nthOfPeriod?: number }>;
  byMonth?: string[];
  byMonthDay?: number[];
}

interface Participant {
  name?: string;
  email?: string;
  kind?: "individual" | "group" | "resource";
  roles: Record<string, boolean>; // "attendee", "owner", "chair"
  participationStatus?: "needs-action" | "accepted" | "declined" | "tentative";
  expectReply?: boolean;
}

interface Alert {
  trigger: { offset: string; relativeTo?: "start" | "end" } | { at: string };
  action: "display" | "email";
}
```

**Acceptance Criteria:**
- [ ] Full CRUD for events via JMAP CalendarEvent
- [ ] Query events by date range (for view rendering)
- [ ] Calendar list management (create, rename, delete, set color)
- [ ] Recurring event expansion (JMAP handles server-side)
- [ ] Event changes sync via WebSocket (delta sync with CalendarEvent/changes)
- [ ] Proper timezone handling

### 6.2 — Calendar Views (Month/Week/Day)

Render events in three calendar views.

**Shared behavior:**
- Navigation: previous/next buttons and "Today" button
- View switcher: Month / Week / Day (keyboard: M, W, D)
- Click empty slot to create event at that time
- Click event to view detail popover
- Drag event to reschedule (update start time)
- Drag event edge to resize (update duration)
- Multiple calendars shown with color coding
- Calendar visibility toggles in sidebar

**Month view:**
- 6-week grid showing current month
- Events shown as colored bars (max 3 per day, "+N more" expander)
- All-day events at top of each cell
- Today highlighted with accent background

**Week view:**
- 7-column grid with hourly rows (configurable start/end: default 7am-10pm)
- Events positioned by start time and duration
- Overlapping events arranged side-by-side
- All-day events in header row
- Current time indicator (red line)
- Scrolls to current time on load

**Day view:**
- Single column with hourly rows
- Events as full-width blocks
- Detailed view with description preview
- Current time indicator

**Acceptance Criteria:**
- [ ] All three views render correctly with events positioned properly
- [ ] View transitions are smooth (crossfade animation)
- [ ] Click empty slot opens new event form at correct time
- [ ] Click event opens detail popover
- [ ] Drag to reschedule with visual feedback (ghost element)
- [ ] Drag to resize duration
- [ ] Multiple calendars with distinct colors
- [ ] Calendar toggle in sidebar to show/hide individual calendars
- [ ] "Today" button returns to current date
- [ ] Current time indicator in week/day views
- [ ] Recurring events render on all applicable dates
- [ ] Responsive: week view collapses to 5-day (workweek) on tablet, day view on mobile
- [ ] Keyboard: arrow keys navigate dates, Enter creates event, Esc closes popover

### 6.3 — Event CRUD

Create, view, edit, and delete calendar events.

**Event form:**
```
+----------------------------------------------------------+
| New Event                                                 |
+----------------------------------------------------------+
| Title: [Sprint Review                              ]     |
| Calendar: [Personal v]                                    |
|                                                          |
| Start: [Mar 14, 2026] [9:00 AM  v] Timezone: [Auto v]   |
| End:   [Mar 14, 2026] [10:30 AM v]                       |
| [x] All day                                              |
|                                                          |
| Location: [Conference Room A                       ]     |
|                                                          |
| Repeat: [None v]  (Weekly, Monthly, Yearly, Custom...)   |
|                                                          |
| Attendees:                                               |
| [autocomplete input — searches contacts      ] [+ Add]  |
|   Alice <alice@example.com>    [Required v] [x]          |
|   Bob <bob@example.com>        [Optional v] [x]          |
|                                                          |
| Reminder: [15 minutes before v] [+ Add another]         |
|                                                          |
| Description:                                             |
| [Rich text editor                                   ]   |
|                                                          |
| Color: [● ● ● ● ● ●]  (color picker)                   |
|                                                          |
|                              [Cancel]  [Save]            |
+----------------------------------------------------------+
```

**Recurrence options:**
- None (one-time event)
- Daily
- Weekly (select days of week)
- Monthly (by day-of-month or by weekday e.g., "2nd Tuesday")
- Yearly
- Custom (interval + frequency + end condition: never, after N, until date)

**Edit recurring event:**
- "Edit this event" (recurrence override)
- "Edit this and future events" (split recurrence)
- "Edit all events" (modify recurrence rule)

**Delete recurring event:**
- Same three options as edit
- Confirmation dialog explaining scope

**Acceptance Criteria:**
- [ ] Event form validates: title required, end after start
- [ ] Date/time picker with clear UX (click, type, or arrow keys)
- [ ] All-day toggle removes time pickers, sets showWithoutTime
- [ ] Recurrence rule builder covers common patterns
- [ ] Custom recurrence with interval, frequency, end condition
- [ ] Edit/delete recurring events with scope selection
- [ ] Attendee autocomplete from contacts
- [ ] Reminder/alert configuration (multiple alerts per event)
- [ ] Calendar selection (which calendar to save to)
- [ ] Color override per event
- [ ] Optimistic update on save
- [ ] Timezone-aware (uses browser timezone, can override per event)

### 6.4 — Meeting Invitations (iCalendar)

Handle incoming meeting invitations and send outgoing ones.

**Incoming invitations:**
- Detect `.ics` attachments in emails
- Parse iCalendar and show event preview in email view
- Action buttons: Accept / Tentative / Decline
- Accepting creates event in calendar via JMAP CalendarEvent/set
- Response sends iCalendar reply to organizer

**Outgoing invitations:**
- When event has attendees, JMAP sends invitations automatically
- Attendee responses update participant status in event

**Event updates from organizer:**
- Updated `.ics` in email updates existing event
- Cancellation `.ics` marks event as cancelled (shows strikethrough)

**Acceptance Criteria:**
- [ ] `.ics` attachments detected and parsed in email view
- [ ] Event preview shown with Accept/Tentative/Decline buttons
- [ ] Accept creates event in default calendar
- [ ] Response sent to organizer automatically
- [ ] Attendee status updates reflected in event detail
- [ ] Cancelled events shown with visual indicator
- [ ] Invitation emails have distinct visual treatment (calendar icon, event summary card)

### 6.5 — Agenda Sidebar in Mail View

Show today's agenda alongside the inbox for at-a-glance scheduling.

**Location:** Right edge of the reading pane (collapsible) or below the folder tree in the sidebar.

**Display:**
- "Today's Schedule" header with date
- Chronological list of events:
  - Time range (9:00 - 10:30)
  - Event title
  - Location (if set)
  - Color dot matching calendar
- "No events today" empty state
- "Tomorrow: 3 events" preview
- Click event to navigate to calendar view

**Acceptance Criteria:**
- [ ] Today's events fetched via CalendarEvent/query with date filter
- [ ] Events sorted chronologically
- [ ] Current/next event highlighted
- [ ] Compact display that doesn't overwhelm the mail view
- [ ] Collapsible with preference saved
- [ ] Updates in real-time via WebSocket (event changes)
- [ ] Click navigates to calendar view for that event

### 6.6 — Calendar Notifications

Alert users of upcoming events.

**Browser notifications:**
- Fire based on event alerts (e.g., 15 minutes before)
- Requires notification permission (requested on calendar first use)
- Notification shows: event title, time, location
- Click notification opens event detail

**In-app alerts:**
- Toast notification when alert triggers
- Snooze option: 5min, 15min, 1hour
- Dismiss to acknowledge

**Implementation:**
- Service Worker checks upcoming events every minute
- Compares current time against event alerts
- Fires notification when within threshold
- Dismissed/snoozed state tracked in localStorage

**Acceptance Criteria:**
- [ ] Browser notification fires at configured alert time
- [ ] Notification permission requested gracefully (not on page load — only when calendar first used)
- [ ] In-app toast with snooze and dismiss
- [ ] Snooze reschedules the alert
- [ ] Works across tabs (only one notification per event via localStorage coordination)
- [ ] Respects browser "Do Not Disturb" settings
