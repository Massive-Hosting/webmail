/** Event form dialog for create/edit */

import React, { useState, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Trash2, MapPin, Clock, Users, Bell, Palette, Repeat } from "lucide-react";
import type {
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  Calendar,
  RecurrenceRule,
  Participant,
  Alert,
} from "@/types/calendar.ts";
import { format, parseISO, minutesToDuration, parseDurationMinutes } from "@/hooks/use-calendar.ts";
import { useContactSearch } from "@/hooks/use-contacts.ts";
import { StyledSelect } from "@/components/ui/styled-select.tsx";

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  calendars: Calendar[];
  defaultDate?: Date;
  defaultHour?: number;
  onSave: (data: CalendarEventCreate | CalendarEventUpdate, eventId?: string) => void;
  onDelete?: (eventId: string) => void;
}

const REMINDER_OPTIONS = [
  { label: "None", value: "" },
  { label: "At time of event", value: "PT0M" },
  { label: "5 minutes before", value: "-PT5M" },
  { label: "15 minutes before", value: "-PT15M" },
  { label: "30 minutes before", value: "-PT30M" },
  { label: "1 hour before", value: "-PT1H" },
  { label: "1 day before", value: "-P1D" },
];

const RECURRENCE_OPTIONS = [
  { label: "Does not repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

const EVENT_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export const EventForm = React.memo(function EventForm({
  open,
  onOpenChange,
  event,
  calendars,
  defaultDate,
  defaultHour,
  onSave,
  onDelete,
}: EventFormProps) {
  const isEditing = !!event;

  // Form state
  const defaultStart = useMemo(() => {
    if (event) return event.start;
    const d = defaultDate ?? new Date();
    const h = defaultHour ?? d.getHours();
    d.setHours(h, 0, 0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm:ss");
  }, [event, defaultDate, defaultHour]);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startDate, setStartDate] = useState(
    defaultStart.substring(0, 10),
  );
  const [startTime, setStartTime] = useState(
    defaultStart.substring(11, 16),
  );
  const [allDay, setAllDay] = useState(event?.showWithoutTime ?? false);
  const [durationMinutes, setDurationMinutes] = useState(
    parseDurationMinutes(event?.duration),
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(() => {
    if (event) {
      return Object.keys(event.calendarIds)[0] ?? calendars[0]?.id ?? "";
    }
    const def = calendars.find((c) => c.isDefault);
    return def?.id ?? calendars[0]?.id ?? "";
  });
  const [recurrence, setRecurrence] = useState<string>(() => {
    if (!event?.recurrenceRules?.length) return "none";
    return event.recurrenceRules[0].frequency;
  });
  const [reminder, setReminder] = useState<string>(() => {
    if (!event?.alerts) return "-PT15M";
    const alertValues = Object.values(event.alerts);
    if (alertValues.length === 0) return "";
    const trigger = alertValues[0].trigger;
    if ("offset" in trigger) return trigger.offset;
    return "";
  });
  const [eventColor, setEventColor] = useState(event?.color ?? "");

  // Attendee management
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<Array<{ name: string; email: string }>>(() => {
    if (!event?.participants) return [];
    return Object.values(event.participants)
      .filter((p) => p.roles?.attendee)
      .map((p) => ({ name: p.name ?? "", email: p.email ?? "" }));
  });

  const { results: contactResults } = useContactSearch(attendeeInput, attendeeInput.length >= 1);

  const endTime = useMemo(() => {
    const [h, m] = startTime.split(":").map(Number);
    const totalMins = h * 60 + m + durationMinutes;
    const eh = Math.floor(totalMins / 60) % 24;
    const em = totalMins % 60;
    return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  }, [startTime, durationMinutes]);

  const handleEndTimeChange = useCallback(
    (newEnd: string) => {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = newEnd.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff <= 0) diff = 30;
      setDurationMinutes(diff);
    },
    [startTime],
  );

  const addAttendee = useCallback(
    (name: string, email: string) => {
      if (!email) return;
      if (attendees.some((a) => a.email === email)) return;
      setAttendees((prev) => [...prev, { name, email }]);
      setAttendeeInput("");
    },
    [attendees],
  );

  const removeAttendee = useCallback((email: string) => {
    setAttendees((prev) => prev.filter((a) => a.email !== email));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;

      const start = allDay
        ? `${startDate}T00:00:00`
        : `${startDate}T${startTime}:00`;

      const calendarIds: Record<string, boolean> = {};
      if (selectedCalendarId) {
        calendarIds[selectedCalendarId] = true;
      }

      const recurrenceRules: RecurrenceRule[] | undefined =
        recurrence === "none"
          ? undefined
          : [
              {
                frequency: recurrence as RecurrenceRule["frequency"],
              },
            ];

      const participants: Record<string, Participant> | undefined =
        attendees.length > 0
          ? Object.fromEntries(
              attendees.map((a, i) => [
                `attendee-${i}`,
                {
                  name: a.name,
                  email: a.email,
                  kind: "individual" as const,
                  roles: { attendee: true },
                  participationStatus: "needs-action" as const,
                  expectReply: true,
                },
              ]),
            )
          : undefined;

      const alerts: Record<string, Alert> | undefined =
        reminder
          ? {
              "alert-0": {
                trigger: { offset: reminder, relativeTo: "start" },
                action: "display",
              },
            }
          : undefined;

      const data: CalendarEventCreate = {
        calendarIds,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        duration: allDay ? "P1D" : minutesToDuration(durationMinutes),
        showWithoutTime: allDay || undefined,
        recurrenceRules,
        participants,
        alerts,
        color: eventColor || undefined,
      };

      onSave(data, event?.id);
      onOpenChange(false);
    },
    [
      title,
      description,
      location,
      startDate,
      startTime,
      allDay,
      durationMinutes,
      selectedCalendarId,
      recurrence,
      attendees,
      reminder,
      eventColor,
      event,
      onSave,
      onOpenChange,
    ],
  );

  const handleDelete = useCallback(() => {
    if (event && onDelete) {
      onDelete(event.id);
      onOpenChange(false);
    }
  }, [event, onDelete, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg shadow-xl z-50 p-6"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {isEditing ? "Edit Event" : "New Event"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-md outline-none"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-secondary)",
              }}
            />

            {/* Calendar selector */}
            {calendars.length > 1 && (
              <div className="flex items-center gap-2">
                <span
                  className="text-xs shrink-0"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Calendar
                </span>
                <StyledSelect
                  value={selectedCalendarId}
                  onValueChange={setSelectedCalendarId}
                  options={calendars.map((cal) => ({
                    value: cal.id,
                    label: cal.name,
                  }))}
                  className="flex-1"
                />
              </div>
            )}

            {/* Date & Time */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: "var(--color-text-tertiary)" }} />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 text-sm rounded outline-none"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-secondary)",
                  }}
                />
                {!allDay && (
                  <>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="px-2 py-1 text-sm rounded outline-none"
                      style={{
                        backgroundColor: "var(--color-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        border: "1px solid var(--color-border-secondary)",
                      }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      to
                    </span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => handleEndTimeChange(e.target.value)}
                      className="px-2 py-1 text-sm rounded outline-none"
                      style={{
                        backgroundColor: "var(--color-bg-tertiary)",
                        color: "var(--color-text-primary)",
                        border: "1px solid var(--color-border-secondary)",
                      }}
                    />
                  </>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer ml-5">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="rounded"
                />
                <span style={{ color: "var(--color-text-secondary)" }}>
                  All day
                </span>
              </label>
            </div>

            {/* Location */}
            <div className="flex items-center gap-2">
              <MapPin
                size={14}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                className="flex-1 px-2 py-1 text-sm rounded outline-none"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-secondary)",
                }}
              />
            </div>

            {/* Recurrence */}
            <div className="flex items-center gap-2">
              <Repeat
                size={14}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <StyledSelect
                value={recurrence}
                onValueChange={setRecurrence}
                options={RECURRENCE_OPTIONS}
                className="flex-1"
              />
            </div>

            {/* Attendees */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Users
                  size={14}
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={attendeeInput}
                    onChange={(e) => setAttendeeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (attendeeInput.includes("@")) {
                          addAttendee("", attendeeInput);
                        }
                      }
                    }}
                    placeholder="Add attendees"
                    className="w-full px-2 py-1 text-sm rounded outline-none"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-secondary)",
                    }}
                  />
                  {/* Contact autocomplete */}
                  {contactResults.length > 0 && attendeeInput.length >= 1 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 py-1 rounded-md shadow-lg z-10 max-h-36 overflow-y-auto"
                      style={{
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-primary)",
                      }}
                    >
                      {contactResults.map((contact) =>
                        contact.emails.map((email) => (
                          <button
                            key={`${contact.id}-${email.address}`}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)]"
                            style={{ color: "var(--color-text-primary)" }}
                            onClick={() => {
                              const displayName =
                                contact.name.full ??
                                `${contact.name.given ?? ""} ${contact.name.surname ?? ""}`.trim();
                              addAttendee(displayName, email.address);
                            }}
                          >
                            <div>{contact.name.full ?? contact.name.given ?? email.address}</div>
                            <div
                              className="text-xs"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {email.address}
                            </div>
                          </button>
                        )),
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Attendee list */}
              {attendees.length > 0 && (
                <div className="flex flex-col gap-1 ml-5">
                  {attendees.map((a) => (
                    <div
                      key={a.email}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        className="flex-1 truncate"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {a.name ? `${a.name} <${a.email}>` : a.email}
                      </span>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]"
                        style={{ color: "var(--color-text-tertiary)" }}
                        onClick={() => removeAttendee(a.email)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reminder */}
            <div className="flex items-center gap-2">
              <Bell
                size={14}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <StyledSelect
                value={reminder}
                onValueChange={setReminder}
                options={REMINDER_OPTIONS}
                className="flex-1"
              />
            </div>

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md outline-none resize-none"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-secondary)",
              }}
            />

            {/* Color */}
            <div className="flex items-center gap-2">
              <Palette
                size={14}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <div className="flex gap-1.5">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-5 h-5 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      transform: eventColor === c ? "scale(1.3)" : undefined,
                      outline:
                        eventColor === c
                          ? `2px solid ${c}`
                          : undefined,
                      outlineOffset: 2,
                    }}
                    onClick={() =>
                      setEventColor(eventColor === c ? "" : c)
                    }
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {isEditing && onDelete && (
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    style={{ color: "var(--color-text-error, #dc2626)" }}
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="px-4 py-1.5 text-sm rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
                  style={{
                    backgroundColor: "var(--color-text-accent)",
                    color: "#ffffff",
                  }}
                >
                  {isEditing ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
