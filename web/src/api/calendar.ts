/** JMAP request builders for CalendarEvent, Calendar operations */

import { apiPost } from "./client.ts";
import type { JMAPRequest, JMAPResponse } from "@/types/jmap.ts";
import type {
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  Calendar,
  CalendarCreate,
  DateRange,
} from "@/types/calendar.ts";

const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:calendars",
];

/** Send a JMAP request through our proxy */
async function jmapCalendarRequest(
  request: JMAPRequest,
): Promise<JMAPResponse> {
  return apiPost<JMAPResponse>("/api/jmap", request);
}

// ---- Calendar operations ----

const CALENDAR_PROPERTIES = ["id", "name", "color", "isVisible", "isDefault"];

/** Fetch all calendars */
export async function fetchCalendars(): Promise<Calendar[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Calendar/get",
        {
          properties: CALENDAR_PROPERTIES,
        },
        "c0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  return (result as { list: Calendar[] }).list;
}

/** Create a new calendar */
export async function createCalendar(
  calendar: CalendarCreate,
): Promise<string> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Calendar/set",
        {
          create: {
            new: calendar,
          },
        },
        "c0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    created?: Record<string, { id: string }>;
    notCreated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notCreated?.new) {
    throw new Error(
      setResult.notCreated.new.description ?? "Failed to create calendar",
    );
  }

  return setResult.created?.new?.id ?? "";
}

/** Update a calendar */
export async function updateCalendar(
  calendarId: string,
  updates: Partial<CalendarCreate>,
): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Calendar/set",
        {
          update: {
            [calendarId]: updates,
          },
        },
        "c0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    notUpdated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notUpdated?.[calendarId]) {
    throw new Error(
      setResult.notUpdated[calendarId].description ??
        "Failed to update calendar",
    );
  }
}

/** Delete a calendar */
export async function deleteCalendar(calendarId: string): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Calendar/set",
        {
          destroy: [calendarId],
        },
        "c0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    notDestroyed?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notDestroyed?.[calendarId]) {
    throw new Error(
      setResult.notDestroyed[calendarId].description ??
        "Failed to delete calendar",
    );
  }
}

// ---- CalendarEvent operations ----

const EVENT_PROPERTIES = [
  "id",
  "calendarIds",
  "title",
  "description",
  "descriptionContentType",
  "location",
  "locations",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "status",
  "freeBusyStatus",
  "recurrenceRules",
  "recurrenceOverrides",
  "excludedRecurrenceRules",
  "participants",
  "replyTo",
  "alerts",
  "color",
  "useDefaultAlerts",
];

/** Fetch calendar events within a date range for given calendars */
export async function fetchCalendarEvents(
  calendarIds: string[],
  dateRange: DateRange,
): Promise<CalendarEvent[]> {
  const filter: Record<string, unknown> = {
    after: dateRange.start,
    before: dateRange.end,
  };

  if (calendarIds.length > 0) {
    filter.inCalendars = calendarIds;
  }

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "CalendarEvent/query",
        {
          filter,
          sort: [{ property: "start", isAscending: true }],
          limit: 10000,
        },
        "q0",
      ],
      [
        "CalendarEvent/get",
        {
          "#ids": {
            resultOf: "q0",
            name: "CalendarEvent/query",
            path: "/ids",
          },
          properties: EVENT_PROPERTIES,
        },
        "g0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const getResponse =
    response.methodResponses[1] ?? response.methodResponses[0];
  const [, getResult] = getResponse;
  return (getResult as { list: CalendarEvent[] }).list;
}

/** Fetch a single calendar event by ID */
export async function fetchCalendarEvent(
  eventId: string,
): Promise<CalendarEvent | null> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "CalendarEvent/get",
        {
          ids: [eventId],
          properties: EVENT_PROPERTIES,
        },
        "g0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const list = (result as { list: CalendarEvent[] }).list;
  return list.length > 0 ? list[0] : null;
}

/** Create a new calendar event */
export async function createCalendarEvent(
  event: CalendarEventCreate,
): Promise<string> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "CalendarEvent/set",
        {
          create: {
            new: event,
          },
        },
        "s0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    created?: Record<string, { id: string }>;
    notCreated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notCreated?.new) {
    throw new Error(
      setResult.notCreated.new.description ?? "Failed to create event",
    );
  }

  return setResult.created?.new?.id ?? "";
}

/** Update a calendar event */
export async function updateCalendarEvent(
  eventId: string,
  updates: CalendarEventUpdate,
): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "CalendarEvent/set",
        {
          update: {
            [eventId]: updates,
          },
        },
        "s0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    notUpdated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notUpdated?.[eventId]) {
    throw new Error(
      setResult.notUpdated[eventId].description ?? "Failed to update event",
    );
  }
}

/** Delete a calendar event */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "CalendarEvent/set",
        {
          destroy: [eventId],
        },
        "s0",
      ],
    ],
  };

  const response = await jmapCalendarRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    notDestroyed?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notDestroyed?.[eventId]) {
    throw new Error(
      setResult.notDestroyed[eventId].description ?? "Failed to delete event",
    );
  }
}
