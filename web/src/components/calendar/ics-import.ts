/** ICS (iCalendar) import for calendar events */

import { toast } from "sonner";
import { createCalendarEvent } from "@/api/calendar.ts";
import type { CalendarEventCreate, RecurrenceRule, Alert } from "@/types/calendar.ts";
import i18n from "@/i18n/index.ts";

/**
 * Parse a DTSTART/DTEND value which may be:
 *  - "20260316T090000"
 *  - "20260316T090000Z"
 *  - "TZID=Europe/Oslo:20260316T090000"
 *  - "20260316" (all-day)
 */
function parseDateTimeValue(raw: string): { localDateTime: string; timeZone?: string; allDay?: boolean } {
  // Check for TZID prefix (comes from the property params, not value — but sometimes combined)
  let timeZone: string | undefined;
  let value = raw;

  const tzMatch = value.match(/^TZID=([^:]+):(.+)$/);
  if (tzMatch) {
    timeZone = tzMatch[1];
    value = tzMatch[2];
  }

  // All-day: "20260316"
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { localDateTime: `${y}-${m}-${d}T00:00:00`, allDay: true };
  }

  // Strip trailing Z (UTC indicator) — store as UTC timezone
  if (value.endsWith("Z")) {
    value = value.slice(0, -1);
    if (!timeZone) timeZone = "Etc/UTC";
  }

  // "20260316T090000" -> "2026-03-16T09:00:00"
  if (/^\d{8}T\d{6}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const hh = value.slice(9, 11);
    const mm = value.slice(11, 13);
    const ss = value.slice(13, 15);
    return { localDateTime: `${y}-${m}-${d}T${hh}:${mm}:${ss}`, timeZone };
  }

  // Fallback: return as-is
  return { localDateTime: value, timeZone };
}

/**
 * Compute ISO 8601 duration between two LocalDateTime strings.
 * E.g. "2026-03-16T09:00:00" and "2026-03-16T10:30:00" -> "PT1H30M"
 */
function computeDuration(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  let diffMs = e.getTime() - s.getTime();
  if (diffMs <= 0) return "PT1H"; // fallback

  const days = Math.floor(diffMs / (86400 * 1000));
  diffMs -= days * 86400 * 1000;
  const hours = Math.floor(diffMs / (3600 * 1000));
  diffMs -= hours * 3600 * 1000;
  const minutes = Math.floor(diffMs / (60 * 1000));

  let duration = "P";
  if (days > 0) duration += `${days}D`;
  if (hours > 0 || minutes > 0) {
    duration += "T";
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
  }
  if (duration === "P") duration = "PT0S";
  return duration;
}

/**
 * Parse an RRULE value into a RecurrenceRule.
 * E.g. "FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE,FR"
 */
function parseRRule(value: string): RecurrenceRule | null {
  const parts = value.split(";");
  const rule: Partial<RecurrenceRule> = {};

  for (const part of parts) {
    const [key, val] = part.split("=");
    if (!key || !val) continue;

    switch (key.toUpperCase()) {
      case "FREQ":
        rule.frequency = val.toLowerCase() as RecurrenceRule["frequency"];
        break;
      case "INTERVAL":
        rule.interval = parseInt(val, 10);
        break;
      case "COUNT":
        rule.count = parseInt(val, 10);
        break;
      case "UNTIL":
        rule.until = parseDateTimeValue(val).localDateTime;
        break;
      case "BYDAY": {
        rule.byDay = val.split(",").map((d) => {
          const match = d.match(/^(-?\d+)?([A-Z]{2})$/);
          if (match) {
            return {
              day: match[2].toLowerCase(),
              ...(match[1] ? { nthOfPeriod: parseInt(match[1], 10) } : {}),
            };
          }
          return { day: d.toLowerCase() };
        });
        break;
      }
      case "BYMONTH":
        rule.byMonth = val.split(",");
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = val.split(",").map((v) => parseInt(v, 10));
        break;
    }
  }

  if (!rule.frequency) return null;
  return rule as RecurrenceRule;
}

/**
 * Parse VALARM blocks into Alert objects.
 * Only handles TRIGGER with duration offsets (e.g. -PT15M).
 */
function parseAlarms(veventLines: string[]): Record<string, Alert> | undefined {
  const alerts: Record<string, Alert> = {};
  let inAlarm = false;
  let trigger: string | undefined;
  let action: string | undefined;
  let alarmIdx = 0;

  for (const line of veventLines) {
    if (line === "BEGIN:VALARM") {
      inAlarm = true;
      trigger = undefined;
      action = undefined;
      continue;
    }
    if (line === "END:VALARM") {
      inAlarm = false;
      if (trigger) {
        const alertAction = (action?.toLowerCase() === "email" ? "email" : "display") as Alert["action"];
        // Handle duration triggers like "-PT15M", "PT0S"
        alerts[String(alarmIdx++)] = {
          trigger: { offset: trigger, relativeTo: "start" },
          action: alertAction,
        };
      }
      continue;
    }
    if (!inAlarm) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = line.substring(0, colonIdx).toUpperCase();
    const val = line.substring(colonIdx + 1).trim();

    if (prop === "TRIGGER" || prop.startsWith("TRIGGER;")) {
      trigger = val;
    } else if (prop === "ACTION") {
      action = val;
    }
  }

  return Object.keys(alerts).length > 0 ? alerts : undefined;
}

/**
 * Parse an ICS string into CalendarEventCreate objects.
 */
export function parseICS(icsText: string, calendarId: string): CalendarEventCreate[] {
  const events: CalendarEventCreate[] = [];

  // Unfold continuation lines (RFC 5545)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let eventLines: string[] = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      eventLines = [];
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      const event = parseVEvent(eventLines, calendarId);
      if (event) events.push(event);
      continue;
    }
    if (inEvent) {
      eventLines.push(line);
    }
  }

  return events;
}

function parseVEvent(lines: string[], calendarId: string): CalendarEventCreate | null {
  let title = "";
  let description: string | undefined;
  let location: string | undefined;
  let startRaw: string | undefined;
  let endRaw: string | undefined;
  let durationRaw: string | undefined;
  let rruleRaw: string | undefined;
  let startTzidFromParam: string | undefined;

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const rawProp = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1).trim();

    // Split prop name from params
    const semicolonIdx = rawProp.indexOf(";");
    const propName = (semicolonIdx === -1 ? rawProp : rawProp.substring(0, semicolonIdx)).toUpperCase();
    const params = semicolonIdx === -1 ? "" : rawProp.substring(semicolonIdx + 1);

    switch (propName) {
      case "SUMMARY":
        title = decodeICSValue(value);
        break;
      case "DESCRIPTION":
        description = decodeICSValue(value);
        break;
      case "LOCATION":
        location = decodeICSValue(value);
        break;
      case "DTSTART": {
        // Check for TZID in params: DTSTART;TZID=Europe/Oslo:20260316T090000
        const tzMatch = params.match(/TZID=([^;:]+)/i);
        if (tzMatch) {
          startTzidFromParam = tzMatch[1];
          startRaw = value;
        } else {
          startRaw = value;
        }
        break;
      }
      case "DTEND":
        endRaw = value;
        // Also check for TZID in params
        if (!startTzidFromParam) {
          const tzMatch = params.match(/TZID=([^;:]+)/i);
          if (tzMatch) startTzidFromParam = tzMatch[1];
        }
        break;
      case "DURATION":
        durationRaw = value;
        break;
      case "RRULE":
        rruleRaw = value;
        break;
    }
  }

  if (!title && !startRaw) return null;

  // Parse start
  const startParsed = startRaw ? parseDateTimeValue(
    startTzidFromParam ? `TZID=${startTzidFromParam}:${startRaw}` : startRaw
  ) : undefined;

  if (!startParsed) return null;

  // Determine duration
  let duration: string | undefined = durationRaw;
  if (!duration && endRaw && startParsed) {
    const endParsed = parseDateTimeValue(endRaw);
    duration = computeDuration(startParsed.localDateTime, endParsed.localDateTime);
  }
  if (!duration) {
    duration = startParsed.allDay ? "P1D" : "PT1H";
  }

  // Parse recurrence rules
  const recurrenceRules: RecurrenceRule[] | undefined = rruleRaw
    ? (() => {
        const rule = parseRRule(rruleRaw);
        return rule ? [rule] : undefined;
      })()
    : undefined;

  // Parse alarms
  const alerts = parseAlarms(lines);

  const event: CalendarEventCreate = {
    calendarIds: { [calendarId]: true },
    title: title || "Untitled Event",
    start: startParsed.localDateTime,
    timeZone: startParsed.timeZone,
    duration,
    showWithoutTime: startParsed.allDay,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(recurrenceRules ? { recurrenceRules } : {}),
    ...(alerts ? { alerts } : {}),
  };

  return event;
}

function decodeICSValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Open file picker for .ics files, parse, and create calendar events.
 * Returns count of imported events.
 */
export async function importICS(calendarId: string): Promise<number> {
  const t = i18n.t.bind(i18n);

  return new Promise<number>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ics,.ical";
    input.multiple = false;

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(0);
        return;
      }

      try {
        const text = await file.text();
        const events = parseICS(text, calendarId);

        if (events.length === 0) {
          toast.error(t("calendar.noEventsInFile"));
          resolve(0);
          return;
        }

        const toastId = events.length > 1
          ? toast.loading(t("calendar.importing"))
          : undefined;

        const BATCH_SIZE = 10;
        let total = 0;
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
          const batch = events.slice(i, i + BATCH_SIZE);
          for (const event of batch) {
            try {
              await createCalendarEvent(event);
              total++;
            } catch {
              // Skip individual failures
            }
          }
          if (toastId) {
            toast.loading(`${t("calendar.importing")} ${total}/${events.length}`, { id: toastId });
          }
        }

        if (toastId) {
          toast.success(t("calendar.imported", { count: total }), { id: toastId });
        } else {
          toast.success(t("calendar.imported", { count: total }));
        }
        resolve(total);
      } catch (err) {
        toast.error(t("calendar.importFailed"));
        reject(err);
      }
    };

    input.click();
  });
}
