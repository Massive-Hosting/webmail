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
import { generateICS, calendarEventToICSData, type ICSMethod } from "@/lib/icalendar.ts";
import { fetchIdentities, fetchMailboxes } from "@/api/mail.ts";

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

const CALENDAR_PROPERTIES = ["id", "name", "color", "isVisible", "isDefault", "shareWith"];

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

  // Note: Stalwart doesn't support inCalendars filter — filter client-side if needed

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

// ---- Invitation Email Sending ----

const JMAP_USING_MAIL = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
];

/**
 * Send calendar invitation emails to attendees.
 * Creates an email with text/calendar MIME part and submits it via JMAP.
 */
export async function sendInvitationEmails(
  event: CalendarEvent | CalendarEventCreate,
  method: ICSMethod,
): Promise<void> {
  // Get sender identity
  const identities = await fetchIdentities();
  const identity = identities[0];
  if (!identity) throw new Error("No sending identity available");

  const eventData = calendarEventToICSData(event, identity.email, identity.name);
  if (eventData.attendees.length === 0) return;

  const icsContent = generateICS(method, eventData);

  // Get mailbox IDs for email creation
  const mailboxes = await fetchMailboxes();
  const sent = mailboxes.find((m) => m.role === "sent");
  const drafts = mailboxes.find((m) => m.role === "drafts");
  const mailboxId = drafts?.id ?? sent?.id;
  if (!mailboxId) throw new Error("No mailbox available");

  const subjectPrefix = method === "CANCEL" ? "Cancelled: " : method === "REPLY" ? "Re: " : "";
  const subject = `${subjectPrefix}${eventData.summary}`;

  // Build a plain text body
  const textBody = method === "CANCEL"
    ? `This event has been cancelled: ${eventData.summary}`
    : `You have been invited to: ${eventData.summary}\n\nPlease respond using the attached calendar invitation.`;

  // Upload the ICS as a blob
  const uploadResp = await fetch("/api/jmap/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "text/calendar; method=" + method },
    body: icsContent,
  });
  if (!uploadResp.ok) throw new Error("Failed to upload invitation");
  const { blobId } = (await uploadResp.json()) as { blobId: string };

  // Create email with calendar attachment and submit to each attendee
  const to = eventData.attendees.map((a) => ({
    name: a.name ?? a.email,
    email: a.email,
  }));

  const emailObj: Record<string, unknown> = {
    mailboxIds: { [mailboxId]: true },
    from: [{ name: identity.name, email: identity.email }],
    to,
    subject,
    keywords: { $seen: true },
    bodyValues: {
      text: { value: textBody, isEncodingProblem: false, isTruncated: false },
    },
    textBody: [{ partId: "text", type: "text/plain" }],
    attachments: [
      {
        blobId,
        type: `text/calendar; method=${method}`,
        name: "invite.ics",
      },
    ],
  };

  const request: JMAPRequest = {
    using: JMAP_USING_MAIL,
    methodCalls: [
      [
        "Email/set",
        { create: { inv: emailObj } },
        "create_email",
      ],
      [
        "EmailSubmission/set",
        {
          create: {
            sub: { emailId: "#inv", identityId: identity.id },
          },
          onSuccessUpdateEmail: {
            "#sub": {
              ...(sent && drafts ? { [`mailboxIds/${drafts.id}`]: null, [`mailboxIds/${sent.id}`]: true } : {}),
              "keywords/$draft": null,
            },
          },
        },
        "submit",
      ],
    ],
  };

  const response = await jmapMailRequest(request);
  for (const [methodName, result] of response.methodResponses) {
    if (methodName === "error") {
      throw new Error((result as { description?: string }).description ?? "Send failed");
    }
    const setResult = result as { notCreated?: Record<string, { description?: string }> };
    if (setResult.notCreated) {
      const firstError = Object.values(setResult.notCreated)[0];
      if (firstError) throw new Error(firstError.description ?? "Send failed");
    }
  }
}

/** Send a REPLY email back to the organizer */
export async function sendInvitationReply(
  parsedEvent: { uid: string; summary: string; dtstart: string; duration?: string; organizer?: { name?: string; email: string } },
  status: "accepted" | "declined" | "tentative",
  replyerEmail: string,
  replyerName?: string,
): Promise<void> {
  if (!parsedEvent.organizer) return;

  const identities = await fetchIdentities();
  const identity = identities[0];
  if (!identity) return;

  const icsContent = generateICS("REPLY", {
    uid: parsedEvent.uid,
    summary: parsedEvent.summary,
    start: parsedEvent.dtstart,
    duration: parsedEvent.duration,
    organizer: parsedEvent.organizer,
    attendees: [{ name: replyerName ?? replyerEmail, email: replyerEmail, status }],
  });

  const mailboxes = await fetchMailboxes();
  const sent = mailboxes.find((m) => m.role === "sent");
  const drafts = mailboxes.find((m) => m.role === "drafts");
  const mailboxId = drafts?.id ?? sent?.id;
  if (!mailboxId) return;

  // Upload ICS
  const uploadResp = await fetch("/api/jmap/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "text/calendar; method=REPLY" },
    body: icsContent,
  });
  if (!uploadResp.ok) return;
  const { blobId } = (await uploadResp.json()) as { blobId: string };

  const statusText = status === "accepted" ? "Accepted" : status === "declined" ? "Declined" : "Tentative";

  const request: JMAPRequest = {
    using: JMAP_USING_MAIL,
    methodCalls: [
      [
        "Email/set",
        {
          create: {
            reply: {
              mailboxIds: { [mailboxId]: true },
              from: [{ name: identity.name, email: identity.email }],
              to: [{ name: parsedEvent.organizer.name ?? parsedEvent.organizer.email, email: parsedEvent.organizer.email }],
              subject: `${statusText}: ${parsedEvent.summary}`,
              keywords: { $seen: true },
              bodyValues: {
                text: { value: `${identity.name ?? identity.email} has ${status} the invitation: ${parsedEvent.summary}`, isEncodingProblem: false, isTruncated: false },
              },
              textBody: [{ partId: "text", type: "text/plain" }],
              attachments: [{ blobId, type: "text/calendar; method=REPLY", name: "invite.ics" }],
            },
          },
        },
        "create_email",
      ],
      [
        "EmailSubmission/set",
        {
          create: { sub: { emailId: "#reply", identityId: identity.id } },
          onSuccessUpdateEmail: {
            "#sub": {
              ...(sent && drafts ? { [`mailboxIds/${drafts.id}`]: null, [`mailboxIds/${sent.id}`]: true } : {}),
              "keywords/$draft": null,
            },
          },
        },
        "submit",
      ],
    ],
  };

  await jmapMailRequest(request);
}

async function jmapMailRequest(request: JMAPRequest): Promise<JMAPResponse> {
  return apiPost<JMAPResponse>("/api/jmap", request);
}
