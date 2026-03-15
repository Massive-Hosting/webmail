import { describe, it, expect } from "vitest";
import {
  parseICalendar,
  parseICalDateTime,
  parseICalDuration,
  isCancellation,
  vEventToCalendarEvent,
  formatEventDateTime,
} from "../icalendar.ts";

describe("parseICalDateTime", () => {
  it("parses a date-only value", () => {
    expect(parseICalDateTime("20260315")).toBe("2026-03-15");
  });

  it("parses a datetime value", () => {
    expect(parseICalDateTime("20260315T140000")).toBe("2026-03-15T14:00:00");
  });

  it("parses a UTC datetime value", () => {
    expect(parseICalDateTime("20260315T140000Z")).toBe("2026-03-15T14:00:00Z");
  });
});

describe("parseICalDuration", () => {
  it("parses a simple duration", () => {
    expect(parseICalDuration("PT1H30M")).toBe("PT1H30M");
  });

  it("strips leading sign", () => {
    expect(parseICalDuration("+PT15M")).toBe("PT15M");
  });
});

describe("parseICalendar", () => {
  const basicInvitation = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:abc-123@example.com
SUMMARY:Team Standup
DTSTART:20260315T090000Z
DTEND:20260315T093000Z
LOCATION:Conference Room A
ORGANIZER;CN=Alice Smith:mailto:alice@example.com
ATTENDEE;CN=Bob Jones;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:bob@example.com
ATTENDEE;CN=Charlie;PARTSTAT=ACCEPTED:mailto:charlie@example.com
DESCRIPTION:Daily standup meeting\\nPlease be on time.
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

  it("parses METHOD correctly", () => {
    const result = parseICalendar(basicInvitation);
    expect(result.method).toBe("REQUEST");
  });

  it("parses event summary and UID", () => {
    const result = parseICalendar(basicInvitation);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].uid).toBe("abc-123@example.com");
    expect(result.events[0].summary).toBe("Team Standup");
  });

  it("parses event dates", () => {
    const result = parseICalendar(basicInvitation);
    const event = result.events[0];
    expect(event.dtstart).toBe("2026-03-15T09:00:00Z");
    expect(event.dtend).toBe("2026-03-15T09:30:00Z");
  });

  it("parses location", () => {
    const result = parseICalendar(basicInvitation);
    expect(result.events[0].location).toBe("Conference Room A");
  });

  it("parses organizer", () => {
    const result = parseICalendar(basicInvitation);
    const org = result.events[0].organizer;
    expect(org).toBeDefined();
    expect(org!.name).toBe("Alice Smith");
    expect(org!.email).toBe("alice@example.com");
  });

  it("parses attendees", () => {
    const result = parseICalendar(basicInvitation);
    const attendees = result.events[0].attendees;
    expect(attendees).toHaveLength(2);
    expect(attendees[0].name).toBe("Bob Jones");
    expect(attendees[0].email).toBe("bob@example.com");
    expect(attendees[0].status).toBe("needs-action");
    expect(attendees[1].name).toBe("Charlie");
    expect(attendees[1].status).toBe("accepted");
  });

  it("parses description with escaped newlines", () => {
    const result = parseICalendar(basicInvitation);
    expect(result.events[0].description).toBe("Daily standup meeting\nPlease be on time.");
  });

  it("parses sequence number", () => {
    const result = parseICalendar(basicInvitation);
    expect(result.events[0].sequence).toBe(0);
  });

  it("handles folded (continuation) lines", () => {
    const folded = `BEGIN:VCALENDAR
VERSION:2.0
METHOD:REQUEST
BEGIN:VEVENT
UID:folded-test@example.com
SUMMARY:A very long event title that is
  continued on the next line
DTSTART:20260401T100000Z
DTEND:20260401T110000Z
END:VEVENT
END:VCALENDAR`;
    const result = parseICalendar(folded);
    expect(result.events[0].summary).toBe("A very long event title that is continued on the next line");
  });

  it("handles missing METHOD (defaults to null)", () => {
    const noMethod = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-method@example.com
SUMMARY:Event
DTSTART:20260401T100000Z
END:VEVENT
END:VCALENDAR`;
    const result = parseICalendar(noMethod);
    expect(result.method).toBeNull();
    expect(result.events).toHaveLength(1);
  });
});

describe("isCancellation", () => {
  it("returns true for CANCEL method", () => {
    const invitation = parseICalendar(`BEGIN:VCALENDAR
METHOD:CANCEL
BEGIN:VEVENT
UID:cancel-test@example.com
SUMMARY:Cancelled Meeting
DTSTART:20260315T090000Z
END:VEVENT
END:VCALENDAR`);
    expect(isCancellation(invitation)).toBe(true);
  });

  it("returns false for REQUEST method", () => {
    const invitation = parseICalendar(`BEGIN:VCALENDAR
METHOD:REQUEST
BEGIN:VEVENT
UID:request-test@example.com
SUMMARY:Meeting
DTSTART:20260315T090000Z
END:VEVENT
END:VCALENDAR`);
    expect(isCancellation(invitation)).toBe(false);
  });
});

describe("vEventToCalendarEvent", () => {
  it("converts a basic event", () => {
    const invitation = parseICalendar(`BEGIN:VCALENDAR
METHOD:REQUEST
BEGIN:VEVENT
UID:convert-test@example.com
SUMMARY:Project Review
DTSTART:20260320T140000Z
DTEND:20260320T150000Z
LOCATION:Room 42
DESCRIPTION:Quarterly review
ORGANIZER;CN=Alice:mailto:alice@example.com
ATTENDEE;CN=Bob;PARTSTAT=NEEDS-ACTION:mailto:bob@example.com
END:VEVENT
END:VCALENDAR`);

    const calEvent = vEventToCalendarEvent(invitation.events[0], "cal-1");

    expect(calEvent.calendarIds).toEqual({ "cal-1": true });
    expect(calEvent.title).toBe("Project Review");
    expect(calEvent.start).toBe("2026-03-20T14:00:00Z");
    expect(calEvent.location).toBe("Room 42");
    expect(calEvent.description).toBe("Quarterly review");
    expect(calEvent.duration).toBe("PT1H");
    expect(calEvent.participants).toBeDefined();
    expect(Object.keys(calEvent.participants!)).toHaveLength(2);
  });

  it("handles events with DURATION instead of DTEND", () => {
    const invitation = parseICalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:duration-test@example.com
SUMMARY:Quick Sync
DTSTART:20260320T140000Z
DURATION:PT30M
END:VEVENT
END:VCALENDAR`);

    const calEvent = vEventToCalendarEvent(invitation.events[0], "cal-1");
    expect(calEvent.duration).toBe("PT30M");
  });
});

describe("formatEventDateTime", () => {
  it("formats a date-only event", () => {
    const formatted = formatEventDateTime({
      uid: "test",
      summary: "Test",
      dtstart: "2026-03-15",
      attendees: [],
    });
    expect(formatted).toContain("2026");
    expect(formatted).toContain("15");
  });

  it("formats a datetime event with start and end", () => {
    const formatted = formatEventDateTime({
      uid: "test",
      summary: "Test",
      dtstart: "2026-03-15T14:00:00Z",
      dtend: "2026-03-15T15:30:00Z",
      attendees: [],
    });
    // Should contain date and time info
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe("No date");
  });

  it("returns 'No date' for empty dtstart", () => {
    const formatted = formatEventDateTime({
      uid: "test",
      summary: "Test",
      dtstart: "",
      attendees: [],
    });
    expect(formatted).toBe("No date");
  });
});

describe("parseICalendar - recurrence", () => {
  it("parses RRULE", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:rrule-test@example.com
SUMMARY:Weekly Sync
DTSTART:20260316T100000Z
DTEND:20260316T110000Z
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10
END:VEVENT
END:VCALENDAR`;
    const result = parseICalendar(ics);
    expect(result.events[0].rrule).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=10");

    const calEvent = vEventToCalendarEvent(result.events[0], "cal-1");
    expect(calEvent.recurrenceRules).toHaveLength(1);
    expect(calEvent.recurrenceRules![0].frequency).toBe("weekly");
    expect(calEvent.recurrenceRules![0].count).toBe(10);
    expect(calEvent.recurrenceRules![0].byDay).toEqual([{ day: "mo" }]);
  });
});
