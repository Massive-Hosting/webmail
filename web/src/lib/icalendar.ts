/** Basic iCalendar (.ics) parser for meeting invitations */

import type { CalendarEventCreate, Participant, RecurrenceRule } from "@/types/calendar.ts";

/** Parsed iCalendar invitation */
export interface ParsedInvitation {
  method: "REQUEST" | "REPLY" | "CANCEL" | "PUBLISH" | null;
  events: ParsedVEvent[];
}

/** Parsed VEVENT from iCalendar data */
export interface ParsedVEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: string; // ISO datetime string
  dtend?: string; // ISO datetime string
  duration?: string; // ISO 8601 duration
  location?: string;
  organizer?: { name?: string; email: string };
  attendees: Array<{ name?: string; email: string; status?: string; role?: string }>;
  status?: string;
  rrule?: string;
  sequence?: number;
}

/** Unfold iCalendar lines (continuation lines start with space or tab) */
function unfoldLines(raw: string): string[] {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Parse a property line into name, params, and value */
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } {
  // Split on first colon, but be aware of colons in params (quoted)
  const colonIdx = findPropertyColon(line);
  if (colonIdx === -1) {
    return { name: line, params: {}, value: "" };
  }

  const nameAndParams = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);

  // Split name from params
  const semiIdx = nameAndParams.indexOf(";");
  let name: string;
  const params: Record<string, string> = {};

  if (semiIdx === -1) {
    name = nameAndParams;
  } else {
    name = nameAndParams.slice(0, semiIdx);
    const paramStr = nameAndParams.slice(semiIdx + 1);
    // Parse params
    for (const p of splitParams(paramStr)) {
      const eqIdx = p.indexOf("=");
      if (eqIdx !== -1) {
        const key = p.slice(0, eqIdx).toUpperCase();
        let val = p.slice(eqIdx + 1);
        // Remove surrounding quotes
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        params[key] = val;
      }
    }
  }

  return { name: name.toUpperCase(), params, value };
}

/** Find the colon that separates property name+params from value */
function findPropertyColon(line: string): number {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ":" && !inQuotes) {
      return i;
    }
  }
  return -1;
}

/** Split parameter string by semicolons, respecting quotes */
function splitParams(str: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of str) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ";" && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Parse an iCalendar date/time string into an ISO datetime string */
export function parseICalDateTime(value: string, tzid?: string): string {
  // Format: YYYYMMDD or YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const clean = value.trim();

  if (clean.length === 8) {
    // Date only: YYYYMMDD
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  // Remove the 'T' separator position check
  const dateStr = clean.replace(/[TZ]/g, "");
  const isUtc = clean.endsWith("Z");

  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  const hour = dateStr.slice(8, 10) || "00";
  const minute = dateStr.slice(10, 12) || "00";
  const second = dateStr.slice(12, 14) || "00";

  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

  if (isUtc) {
    return `${iso}Z`;
  }

  // If we have a timezone, we return the local time as-is
  // (the consuming code can use the timezone separately)
  return iso;
}

/** Convert iCalendar DURATION to ISO 8601 duration */
export function parseICalDuration(value: string): string {
  // iCalendar duration is already mostly ISO 8601 compatible
  // Format: [+/-]P[nW] or [+/-]P[nD][T[nH][nM][nS]]
  return value.trim().replace(/^[+-]/, "");
}

/** Extract a mailto: email from a value like "mailto:foo@bar.com" */
function extractEmail(value: string): string {
  const match = value.match(/mailto:([^\s]+)/i);
  return match ? match[1] : value;
}

/**
 * Parse an iCalendar (.ics) string into a structured ParsedInvitation.
 * Handles the common cases for meeting invitations.
 */
export function parseICalendar(icsContent: string): ParsedInvitation {
  const lines = unfoldLines(icsContent);
  const result: ParsedInvitation = {
    method: null,
    events: [],
  };

  let inCalendar = false;
  let inEvent = false;
  let currentEvent: ParsedVEvent | null = null;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    const { name, params, value } = parseLine(rawLine);

    if (name === "BEGIN") {
      if (value === "VCALENDAR") {
        inCalendar = true;
      } else if (value === "VEVENT" && inCalendar) {
        inEvent = true;
        currentEvent = {
          uid: "",
          summary: "",
          dtstart: "",
          attendees: [],
        };
      }
      continue;
    }

    if (name === "END") {
      if (value === "VEVENT" && currentEvent) {
        result.events.push(currentEvent);
        currentEvent = null;
        inEvent = false;
      } else if (value === "VCALENDAR") {
        inCalendar = false;
      }
      continue;
    }

    // VCALENDAR-level properties
    if (inCalendar && !inEvent) {
      if (name === "METHOD") {
        result.method = value.toUpperCase() as ParsedInvitation["method"];
      }
      continue;
    }

    // VEVENT-level properties
    if (inEvent && currentEvent) {
      switch (name) {
        case "UID":
          currentEvent.uid = value;
          break;
        case "SUMMARY":
          currentEvent.summary = value;
          break;
        case "DESCRIPTION":
          // Unescape common iCalendar escapes
          currentEvent.description = value
            .replace(/\\n/g, "\n")
            .replace(/\\,/g, ",")
            .replace(/\\\\/g, "\\");
          break;
        case "DTSTART":
          currentEvent.dtstart = parseICalDateTime(value, params["TZID"]);
          break;
        case "DTEND":
          currentEvent.dtend = parseICalDateTime(value, params["TZID"]);
          break;
        case "DURATION":
          currentEvent.duration = parseICalDuration(value);
          break;
        case "LOCATION":
          currentEvent.location = value.replace(/\\,/g, ",").replace(/\\\\/g, "\\");
          break;
        case "ORGANIZER": {
          const orgEmail = extractEmail(value);
          currentEvent.organizer = {
            name: params["CN"] || undefined,
            email: orgEmail,
          };
          break;
        }
        case "ATTENDEE": {
          const attEmail = extractEmail(value);
          currentEvent.attendees.push({
            name: params["CN"] || undefined,
            email: attEmail,
            status: params["PARTSTAT"]?.toLowerCase(),
            role: params["ROLE"]?.toLowerCase(),
          });
          break;
        }
        case "STATUS":
          currentEvent.status = value;
          break;
        case "RRULE":
          currentEvent.rrule = value;
          break;
        case "SEQUENCE":
          currentEvent.sequence = parseInt(value, 10);
          break;
      }
    }
  }

  return result;
}

/** Check if an invitation is a cancellation */
export function isCancellation(invitation: ParsedInvitation): boolean {
  return invitation.method === "CANCEL";
}

/**
 * Convert a ParsedVEvent to a JMAP CalendarEventCreate.
 * Used when accepting an invitation.
 */
export function vEventToCalendarEvent(
  event: ParsedVEvent,
  calendarId: string,
): CalendarEventCreate {
  const result: CalendarEventCreate = {
    calendarIds: { [calendarId]: true },
    title: event.summary,
    start: event.dtstart,
    status: "confirmed",
  };

  if (event.description) {
    result.description = event.description;
  }

  if (event.location) {
    result.location = event.location;
  }

  if (event.duration) {
    result.duration = event.duration;
  } else if (event.dtend && event.dtstart) {
    // Calculate duration from DTSTART and DTEND
    result.duration = calculateDuration(event.dtstart, event.dtend);
  }

  // Convert participants
  if (event.organizer || event.attendees.length > 0) {
    const participants: Record<string, Participant> = {};

    if (event.organizer) {
      participants["organizer"] = {
        name: event.organizer.name,
        email: event.organizer.email,
        roles: { owner: true },
        participationStatus: "accepted",
      };
    }

    for (let i = 0; i < event.attendees.length; i++) {
      const att = event.attendees[i];
      const partStatus = mapPartStatus(att.status);
      participants[`attendee-${i}`] = {
        name: att.name,
        email: att.email,
        roles: { attendee: true },
        participationStatus: partStatus,
      };
    }

    result.participants = participants;
  }

  // Parse recurrence rule
  if (event.rrule) {
    const rrule = parseRRule(event.rrule);
    if (rrule) {
      result.recurrenceRules = [rrule];
    }
  }

  return result;
}

/** Map iCalendar PARTSTAT to JMAP participation status */
function mapPartStatus(status?: string): Participant["participationStatus"] {
  switch (status) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "tentative":
      return "tentative";
    default:
      return "needs-action";
  }
}

/** Calculate ISO 8601 duration from two datetime strings */
function calculateDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (isNaN(diffMs) || diffMs <= 0) {
    return "PT1H"; // Default to 1 hour
  }

  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `PT${hours}H${minutes}M`;
  } else if (hours > 0) {
    return `PT${hours}H`;
  } else {
    return `PT${minutes}M`;
  }
}

/** Parse a basic RRULE string into a RecurrenceRule */
function parseRRule(rruleStr: string): RecurrenceRule | null {
  const parts: Record<string, string> = {};
  for (const segment of rruleStr.split(";")) {
    const eqIdx = segment.indexOf("=");
    if (eqIdx !== -1) {
      parts[segment.slice(0, eqIdx).toUpperCase()] = segment.slice(eqIdx + 1);
    }
  }

  const freq = parts["FREQ"]?.toLowerCase();
  if (!freq || !["yearly", "monthly", "weekly", "daily"].includes(freq)) {
    return null;
  }

  const rule: RecurrenceRule = {
    frequency: freq as RecurrenceRule["frequency"],
  };

  if (parts["INTERVAL"]) {
    rule.interval = parseInt(parts["INTERVAL"], 10);
  }

  if (parts["COUNT"]) {
    rule.count = parseInt(parts["COUNT"], 10);
  }

  if (parts["UNTIL"]) {
    rule.until = parseICalDateTime(parts["UNTIL"]);
  }

  if (parts["BYDAY"]) {
    rule.byDay = parts["BYDAY"].split(",").map((d) => {
      const match = d.match(/^(-?\d+)?(\w{2})$/);
      if (match) {
        return {
          day: match[2].toLowerCase(),
          nthOfPeriod: match[1] ? parseInt(match[1], 10) : undefined,
        };
      }
      return { day: d.toLowerCase() };
    });
  }

  return rule;
}

/**
 * Format a parsed event's date/time for display.
 * Returns a human-readable string.
 */
export function formatEventDateTime(event: ParsedVEvent): string {
  const startStr = event.dtstart;
  if (!startStr) return "No date";

  try {
    // Check if it's a date-only value
    if (!startStr.includes("T")) {
      const date = new Date(startStr + "T00:00:00");
      if (isNaN(date.getTime())) return startStr;
      return date.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    const start = new Date(startStr);
    if (isNaN(start.getTime())) return startStr;

    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    const timeOpts: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };

    const datePart = start.toLocaleDateString(undefined, dateOpts);
    const timePart = start.toLocaleTimeString(undefined, timeOpts);

    if (event.dtend) {
      const end = new Date(event.dtend);
      if (!isNaN(end.getTime())) {
        const endTimePart = end.toLocaleTimeString(undefined, timeOpts);
        // Same day?
        if (start.toDateString() === end.toDateString()) {
          return `${datePart}, ${timePart} - ${endTimePart}`;
        }
        const endDatePart = end.toLocaleDateString(undefined, dateOpts);
        return `${datePart} ${timePart} - ${endDatePart} ${endTimePart}`;
      }
    }

    return `${datePart}, ${timePart}`;
  } catch {
    return startStr;
  }
}
