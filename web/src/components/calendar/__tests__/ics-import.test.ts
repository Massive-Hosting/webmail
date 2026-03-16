import { describe, it, expect } from "vitest";
import { parseICS } from "../ics-import.ts";

const calId = "cal-1";

function makeICS(...vevents: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Test//EN",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

describe("parseICS", () => {
  it("parses basic VEVENT with SUMMARY, DTSTART, DTEND", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Team standup",
        "DTSTART:20260316T090000",
        "DTEND:20260316T093000",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Team standup");
    expect(events[0].start).toBe("2026-03-16T09:00:00");
    expect(events[0].duration).toBe("PT30M");
    expect(events[0].calendarIds).toEqual({ [calId]: true });
  });

  it("parses VEVENT with DURATION instead of DTEND", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Workshop",
        "DTSTART:20260316T140000",
        "DURATION:PT2H30M",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].duration).toBe("PT2H30M");
  });

  it("parses VEVENT with all-day dates (VALUE=DATE)", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Holiday",
        "DTSTART;VALUE=DATE:20260316",
        "DTEND;VALUE=DATE:20260317",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].start).toBe("2026-03-16T00:00:00");
    expect(events[0].showWithoutTime).toBe(true);
    expect(events[0].duration).toBe("P1D");
  });

  it("parses VEVENT with TZID on DTSTART", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Oslo meeting",
        "DTSTART;TZID=Europe/Oslo:20260316T100000",
        "DTEND;TZID=Europe/Oslo:20260316T110000",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].timeZone).toBe("Europe/Oslo");
    expect(events[0].start).toBe("2026-03-16T10:00:00");
  });

  it("parses VEVENT with UTC datetime (Z suffix)", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:UTC event",
        "DTSTART:20260316T080000Z",
        "DTEND:20260316T090000Z",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].timeZone).toBe("Etc/UTC");
    expect(events[0].start).toBe("2026-03-16T08:00:00");
  });

  it("parses VEVENT with RRULE", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Weekly sync",
        "DTSTART:20260316T090000",
        "DTEND:20260316T093000",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE,FR",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].recurrenceRules).toBeDefined();
    const rule = events[0].recurrenceRules![0];
    expect(rule.frequency).toBe("weekly");
    expect(rule.interval).toBe(2);
    expect(rule.count).toBe(10);
    expect(rule.byDay).toEqual([
      { day: "mo" },
      { day: "we" },
      { day: "fr" },
    ]);
  });

  it("parses VEVENT with VALARM", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Alarm test",
        "DTSTART:20260316T090000",
        "DTEND:20260316T100000",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "ACTION:DISPLAY",
        "END:VALARM",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].alerts).toBeDefined();
    const alert = events[0].alerts!["0"];
    expect(alert.action).toBe("display");
    expect(alert.trigger).toEqual({ offset: "-PT15M", relativeTo: "start" });
  });

  it("parses VEVENT with DESCRIPTION and LOCATION", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Conference",
        "DTSTART:20260316T090000",
        "DTEND:20260316T170000",
        "DESCRIPTION:Annual planning\\nWith all teams",
        "LOCATION:Room 42\\, Building A",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].description).toBe("Annual planning\nWith all teams");
    expect(events[0].location).toBe("Room 42, Building A");
  });

  it("parses file with multiple VEVENTs", () => {
    const ics = makeICS(
      vevent([
        "SUMMARY:Event 1",
        "DTSTART:20260316T090000",
        "DTEND:20260316T100000",
      ]),
      vevent([
        "SUMMARY:Event 2",
        "DTSTART:20260317T140000",
        "DTEND:20260317T150000",
      ]),
      vevent([
        "SUMMARY:Event 3",
        "DTSTART:20260318T080000",
        "DURATION:PT45M",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(3);
    expect(events[0].title).toBe("Event 1");
    expect(events[1].title).toBe("Event 2");
    expect(events[2].title).toBe("Event 3");
  });

  it("returns empty array for empty/invalid input", () => {
    expect(parseICS("", calId)).toEqual([]);
    expect(parseICS("not an ics file", calId)).toEqual([]);
    expect(parseICS("BEGIN:VCALENDAR\r\nEND:VCALENDAR", calId)).toEqual([]);
  });

  it("uses 'Untitled Event' for VEVENT with missing SUMMARY", () => {
    const ics = makeICS(
      vevent([
        "DTSTART:20260316T090000",
        "DTEND:20260316T100000",
      ]),
    );
    const events = parseICS(ics, calId);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Untitled Event");
  });
});
