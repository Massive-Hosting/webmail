/** Calendar and CalendarEvent types (JMAP Calendars) */

export interface CalendarEvent {
  id: string;
  calendarIds: Record<string, boolean>;
  title: string;
  description?: string;
  descriptionContentType?: string;
  location?: string;
  locations?: Record<string, { name?: string; description?: string }>;
  start: string; // LocalDateTime "2026-03-14T09:00:00"
  timeZone?: string; // "America/New_York"
  duration?: string; // "PT1H30M" (ISO 8601 duration)
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

export interface RecurrenceRule {
  frequency: "yearly" | "monthly" | "weekly" | "daily";
  interval?: number;
  until?: string;
  count?: number;
  byDay?: Array<{ day: string; nthOfPeriod?: number }>;
  byMonth?: string[];
  byMonthDay?: number[];
}

export interface Participant {
  name?: string;
  email?: string;
  kind?: "individual" | "group" | "resource";
  roles: Record<string, boolean>;
  participationStatus?:
    | "needs-action"
    | "accepted"
    | "declined"
    | "tentative";
  expectReply?: boolean;
}

export interface Alert {
  trigger:
    | { offset: string; relativeTo?: "start" | "end" }
    | { at: string };
  action: "display" | "email";
}

export interface CalendarSharePermission {
  mayReadItems: boolean;
  mayUpdateItems?: boolean;
  mayDelete?: boolean;
}

export interface Calendar {
  id: string;
  name: string;
  color?: string;
  isVisible?: boolean;
  isDefault?: boolean;
  shareWith?: Record<string, CalendarSharePermission>;
}

/** Data for creating a new calendar event (without id) */
export type CalendarEventCreate = Omit<CalendarEvent, "id">;

/** Partial event data for updates */
export type CalendarEventUpdate = Partial<CalendarEventCreate>;

/** Data for creating a new calendar */
export type CalendarCreate = Omit<Calendar, "id">;

/** View mode for the calendar */
export type CalendarViewMode = "month" | "week" | "day";

/** Date range for querying events */
export interface DateRange {
  start: string; // ISO date string
  end: string; // ISO date string
}
