/** Event form dialog for create/edit */

import React, { useState, useCallback, useMemo, useRef, useEffect, startTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Trash2, MapPin, Clock, Users, Bell, Palette, Repeat, Check, HelpCircle, Video } from "lucide-react";
import type {
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  Calendar,
  RecurrenceRule,
  Participant,
  Alert,
} from "@/types/calendar.ts";
import { format, parseISO, minutesToDuration, parseDurationMinutes, getEventColor, isEventOnDay } from "@/hooks/use-calendar.ts";
import { useContactSearch } from "@/hooks/use-contacts.ts";
import { getEventParticipants } from "@/api/participants.ts";
import { fetchAvailability, listResources, type BusySlot, type Resource } from "@/api/availability.ts";
import { StyledSelect } from "@/components/ui/styled-select.tsx";
import { useTranslation } from "react-i18next";

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  calendars: Calendar[];
  dayEvents?: CalendarEvent[];
  defaultDate?: Date;
  defaultHour?: number;
  defaultAttendees?: string[];
  onSave: (data: CalendarEventCreate | CalendarEventUpdate, eventId?: string) => void;
  onDelete?: (eventId: string) => void;
}

const REMINDER_OPTION_KEYS = [
  { key: "calendar.reminderNone", value: "" },
  { key: "calendar.reminderAtTime", value: "PT0M" },
  { key: "calendar.reminder5min", value: "-PT5M" },
  { key: "calendar.reminder15min", value: "-PT15M" },
  { key: "calendar.reminder30min", value: "-PT30M" },
  { key: "calendar.reminder1hour", value: "-PT1H" },
  { key: "calendar.reminder1day", value: "-P1D" },
];

const RECURRENCE_OPTION_KEYS = [
  { key: "calendar.doesNotRepeat", value: "none" },
  { key: "calendar.daily", value: "daily" },
  { key: "calendar.weekly", value: "weekly" },
  { key: "calendar.monthly", value: "monthly" },
  { key: "calendar.yearly", value: "yearly" },
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

/** Timeline hours: 7am to 9pm */
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 21;
const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
  (_, i) => TIMELINE_START_HOUR + i,
);
const HOUR_HEIGHT = 48; // px per hour row
const MIN_DURATION_MINUTES = 15;

export const EventForm = React.memo(function EventForm({
  open,
  onOpenChange,
  event,
  calendars,
  dayEvents,
  defaultDate,
  defaultHour,
  defaultAttendees,
  onSave,
  onDelete,
}: EventFormProps) {
  const { t } = useTranslation();
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
  const [description, setDescription] = useState((event?.description ?? "").replace("[wave-meeting]", "").trim());
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
  const [waveMeeting, setWaveMeeting] = useState(false);

  // Attendee management
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<Array<{ name: string; email: string; participationStatus?: Participant["participationStatus"] }>>([]);

  // Sync form state when event prop changes (e.g., opening edit dialog).
  useEffect(() => {
    if (!open) return;
    startTransition(() => {
      setTitle(event?.title ?? "");
      setDescription((event?.description ?? "").replace("[wave-meeting]", "").trim());
      setLocation(event?.location ?? "");
      setAllDay(event?.showWithoutTime ?? false);
      setDurationMinutes(parseDurationMinutes(event?.duration));
      setEventColor(event?.color ?? "");
      setWaveMeeting(event?.description?.includes("[wave-meeting]") ?? false);
      setAttendeeInput("");

      if (event) {
        const s = event.start;
        setStartDate(s.substring(0, 10));
        setStartTime(s.substring(11, 16));
        setSelectedCalendarId(Object.keys(event.calendarIds)[0] ?? calendars[0]?.id ?? "");
      } else {
        const d = defaultDate ?? new Date();
        const h = defaultHour ?? d.getHours();
        d.setHours(h, 0, 0, 0);
        const s = format(d, "yyyy-MM-dd'T'HH:mm:ss");
        setStartDate(s.substring(0, 10));
        setStartTime(s.substring(11, 16));
        const def = calendars.find((c) => c.isDefault);
        setSelectedCalendarId(def?.id ?? calendars[0]?.id ?? "");
      }

      if (!event?.recurrenceRules?.length) {
        setRecurrence("none");
      } else {
        setRecurrence(event.recurrenceRules[0].frequency);
      }

      if (!event?.alerts) {
        setReminder("-PT15M");
      } else {
        const alertValues = Object.values(event.alerts);
        if (alertValues.length === 0) {
          setReminder("");
        } else {
          const trigger = alertValues[0].trigger;
          setReminder("offset" in trigger ? trigger.offset : "");
        }
      }

      // Load attendees from webmail DB (Stalwart doesn't return participants via JMAP).
      if (event?.id) {
        getEventParticipants(event.id)
          .then((participants) => {
            setAttendees(
              participants.map((p) => ({
                name: p.name,
                email: p.email,
                participationStatus: p.status as Participant["participationStatus"],
              })),
            );
          })
          .catch(() => setAttendees([]));
      } else if (defaultAttendees && defaultAttendees.length > 0) {
        // Pre-populate from team view click
        setAttendees(defaultAttendees.map((email) => ({
          name: email.split("@")[0].replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          email,
        })));
      } else {
        setAttendees([]);
      }
    });
  }, [event, open, calendars, defaultDate, defaultHour, defaultAttendees]);

  const { results: contactResults } = useContactSearch(attendeeInput, attendeeInput.length >= 1);

  // Fetch free/busy for attendees when date changes
  const [attendeeBusySlots, setAttendeeBusySlots] = useState<Record<string, BusySlot[]>>({});
  useEffect(() => {
    if (attendees.length === 0 || allDay) {
      startTransition(() => setAttendeeBusySlots({}));
      return;
    }
    const dayStart = `${startDate}T00:00:00`;
    const dayEnd = `${startDate}T23:59:59`;
    Promise.all(
      attendees.map((a) =>
        fetchAvailability(a.email, dayStart, dayEnd)
          .then((slots) => [a.email, slots] as const)
          .catch(() => [a.email, []] as const),
      ),
    ).then((results) => {
      startTransition(() => setAttendeeBusySlots(Object.fromEntries(results)));
    });
  }, [attendees, startDate, allDay]);

  // Fetch available rooms
  const [rooms, setRooms] = useState<Resource[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  useEffect(() => {
    listResources().then(setRooms).catch(() => setRooms([]));
  }, []);

  const handleSelectRoom = useCallback((roomEmail: string) => {
    setSelectedRoom(roomEmail);
    const room = rooms.find((r) => r.email === roomEmail);
    if (room) {
      setLocation(room.name || room.description);
    }
  }, [rooms]);

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

      // Build description with wave-meeting marker
      let finalDescription = description.replace("[wave-meeting]", "").trim();
      if (waveMeeting) {
        finalDescription = finalDescription ? `${finalDescription} [wave-meeting]` : "[wave-meeting]";
      }

      const data: CalendarEventCreate = {
        calendarIds,
        title: title.trim(),
        description: finalDescription || undefined,
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
      waveMeeting,
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

  // Resolve event color for timeline: custom color > calendar color > fallback
  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);
  const resolvedColor = eventColor || selectedCalendar?.color || "#3b82f6";

  // Other events on the same day (exclude the one being edited), reactive to date changes
  const otherDayEvents = useMemo(() => {
    if (!dayEvents) return [];
    const formDate = new Date(startDate + "T12:00:00");
    return dayEvents.filter((e) => {
      if (e.id === event?.id) return false;
      if (e.showWithoutTime) return false;
      return isEventOnDay(e, formDate);
    });
  }, [dayEvents, event?.id, startDate]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-h-[85vh] rounded-lg shadow-xl z-50 flex flex-col bg-elevated border-primary"
          style={{ maxWidth: 900 }}
        >
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <Dialog.Title
              className="text-lg font-semibold text-primary"
            >
              {isEditing ? t("calendar.editEvent") : t("calendar.newEvent")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-tertiary"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left column: form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 px-6 pt-1 pb-6 overflow-y-auto" style={{ minWidth: 0 }}>
              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("calendar.eventTitle")}
                required
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-md outline-none bg-elevated text-primary border-primary"
              />

              {/* Calendar selector */}
              {calendars.length > 1 && (
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs shrink-0 text-tertiary"
                  >
                    {t("calendar.calendar")}
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
                  <Clock size={14} className="text-tertiary" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-2 py-1 text-sm rounded outline-none text-primary border-secondary"
                  />
                  {!allDay && (
                    <>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="px-2 py-1 text-sm rounded outline-none text-primary border-secondary"
                      />
                      <span className="text-xs text-tertiary">
                        {t("calendar.to")}
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                        className="px-2 py-1 text-sm rounded outline-none text-primary border-secondary"
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
                  <span className="text-secondary">
                    {t("calendar.allDay")}
                  </span>
                </label>
              </div>

              {/* Location */}
              <div className="flex items-center gap-2">
                <MapPin
                  size={14}
                  className="text-tertiary"
                />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("calendar.addLocation")}
                  className="flex-1 px-2 py-1 text-sm rounded outline-none text-primary border-secondary"
                />
              </div>

              {/* Room picker */}
              {rooms.length > 0 && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-tertiary" />
                  <StyledSelect
                    value={selectedRoom}
                    onValueChange={handleSelectRoom}
                    options={[
                      { value: "", label: t("calendar.noRoom") },
                      ...rooms.map((room) => ({
                        value: room.email,
                        label: `${room.name || room.email}${room.description ? ` (${room.description})` : ""}`,
                      })),
                    ]}
                    className="flex-1 text-sm"
                  />
                </div>
              )}

              {/* Recurrence */}
              <div className="flex items-center gap-2">
                <Repeat
                  size={14}
                  className="text-tertiary"
                />
                <StyledSelect
                  value={recurrence}
                  onValueChange={setRecurrence}
                  options={RECURRENCE_OPTION_KEYS.map(o => ({ value: o.value, label: t(o.key) }))}
                  className="flex-1"
                />
              </div>

              {/* Attendees */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Users
                    size={14}
                    className="text-tertiary"
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
                      placeholder={t("calendar.addAttendees")}
                      className="w-full px-2 py-1 text-sm rounded outline-none text-primary border-secondary"
                    />
                    {/* Contact autocomplete */}
                    {contactResults.length > 0 && attendeeInput.length >= 1 && (
                      <div
                        className="absolute top-full left-0 right-0 mt-1 py-1 rounded-md shadow-lg z-10 max-h-36 overflow-y-auto bg-elevated border-primary"
                      >
                        {contactResults.map((contact) =>
                          contact.emails.map((email) => (
                            <button
                              key={`${contact.id}-${email.address}`}
                              type="button"
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] text-primary"
                              onClick={() => {
                                const displayName =
                                  contact.name.full ??
                                  `${contact.name.given ?? ""} ${contact.name.surname ?? ""}`.trim();
                                addAttendee(displayName, email.address);
                              }}
                            >
                              <div>{contact.name.full ?? contact.name.given ?? email.address}</div>
                              <div
                                className="text-xs text-tertiary"
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

                {/* Attendee list with free/busy indicator */}
                {attendees.length > 0 && (
                  <div className="flex flex-col gap-1 ml-5">
                    {attendees.map((a) => {
                      // Check if attendee is busy at the current event time
                      const slots = attendeeBusySlots?.[a.email] ?? [];
                      const [sh2, sm2] = startTime.split(":").map(Number);
                      const eventStart = sh2 * 60 + sm2;
                      const eventEnd = eventStart + durationMinutes;
                      // When editing, compute the original event's time to exclude it from busy check
                      let origStartMins = -1;
                      let origDur = -1;
                      let origDate = "";
                      if (isEditing && event) {
                        const origStart = new Date(event.start);
                        origStartMins = origStart.getHours() * 60 + origStart.getMinutes();
                        origDur = parseDurationMinutes(event.duration);
                        origDate = format(origStart, "yyyy-MM-dd");
                      }
                      const isBusy = !allDay && slots.some((slot) => {
                        const st = new Date(slot.start);
                        const slotDate = format(st, "yyyy-MM-dd");
                        if (slotDate !== startDate) return false;
                        const slotStartMins = st.getHours() * 60 + st.getMinutes();
                        const slotDur = parseDurationMinutes(slot.duration);
                        const slotEndMins = slotStartMins + slotDur;
                        // Exclude the event being edited (match against original time)
                        if (isEditing && slotDate === origDate &&
                            slotStartMins === origStartMins && slotDur === origDur) return false;
                        return eventStart < slotEndMins && eventEnd > slotStartMins;
                      });
                      const hasBusyData = slots.length > 0 || Object.keys(attendeeBusySlots ?? {}).includes(a.email);

                      return (
                        <div
                          key={a.email}
                          className="flex items-center gap-2 text-sm"
                        >
                          {/* Free/busy indicator */}
                          {hasBusyData ? (
                            <span
                              className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${isBusy ? "pill--danger" : "pill--success"}`}
                            >
                              {isBusy ? t("calendar.busy") : t("calendar.free")}
                            </span>
                          ) : isEditing && a.participationStatus ? (
                            <span className="shrink-0" title={
                              a.participationStatus === "accepted" ? t("calendar.accepted")
                                : a.participationStatus === "declined" ? t("calendar.declined")
                                : a.participationStatus === "tentative" ? t("calendar.tentative")
                                : t("calendar.needsAction")
                            }>
                              {a.participationStatus === "accepted" && <Check size={13} className="text-success" />}
                              {a.participationStatus === "declined" && <X size={13} className="text-danger" />}
                              {a.participationStatus === "tentative" && <HelpCircle size={13} className="text-warning" />}
                              {a.participationStatus === "needs-action" && <Clock size={13} className="text-tertiary" />}
                            </span>
                          ) : null}
                          <span
                            className="flex-1 truncate text-secondary"
                          >
                            {a.name ? `${a.name} <${a.email}>` : a.email}
                          </span>
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)] text-tertiary"
                            onClick={() => removeAttendee(a.email)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Wave Meeting toggle */}
              <div className="flex items-center gap-2 px-1 py-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer text-secondary">
                  <input
                    type="checkbox"
                    checked={waveMeeting}
                    onChange={(e) => setWaveMeeting(e.target.checked)}
                    style={{ accentColor: "var(--color-bg-accent)" }}
                  />
                  <Video size={14} className={waveMeeting ? undefined : "text-tertiary"} style={waveMeeting ? { color: "var(--color-indigo)" } : undefined} />
                  {t("calendar.waveMeeting")}
                </label>
              </div>

              {/* Reminder */}
              <div className="flex items-center gap-2">
                <Bell
                  size={14}
                  className="text-tertiary"
                />
                <StyledSelect
                  value={reminder}
                  onValueChange={setReminder}
                  options={REMINDER_OPTION_KEYS.map(o => ({ value: o.value, label: t(o.key) }))}
                  className="flex-1"
                />
              </div>

              {/* Description */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("calendar.addDescription")}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-md outline-none resize-none bg-elevated text-primary border-primary"
              />

              {/* Color */}
              <div className="flex items-center gap-2">
                <Palette
                  size={14}
                  className="text-tertiary"
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
                      className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors text-danger"
                      onClick={handleDelete}
                    >
                      <Trash2 size={14} />
                      {t("calendar.deleteEvent")}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="px-4 py-1.5 text-sm rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors text-secondary"
                    >
                      {t("calendar.close")}
                    </button>
                  </Dialog.Close>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors text-inverse"
                    style={{ backgroundColor: "var(--color-text-accent)" }}
                  >
                    {isEditing ? t("calendar.editEventBtn") : t("calendar.create")}
                  </button>
                </div>
              </div>
            </form>

            {/* Right column: day timeline */}
            {!allDay && (
              <div
                className="shrink-0 overflow-y-auto bg-primary"
                style={{
                  width: 280,
                  borderLeft: "1px solid var(--color-border-secondary)",
                }}
              >
                <DayTimeline
                  startTime={startTime}
                  durationMinutes={durationMinutes}
                  color={resolvedColor}
                  onStartTimeChange={setStartTime}
                  onDurationChange={setDurationMinutes}
                  title={title}
                  otherEvents={otherDayEvents}
                  calendars={calendars}
                  attendeeBusySlots={attendeeBusySlots}
                  currentDate={startDate}
                  editingEvent={event}
                />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

/* ------------------------------------------------------------------ */
/* Day timeline component with drag-to-move and resize-to-change      */
/* ------------------------------------------------------------------ */


interface DayTimelineProps {
  startTime: string;     // "HH:mm"
  durationMinutes: number;
  color: string;
  onStartTimeChange: (time: string) => void;
  onDurationChange: (minutes: number) => void;
  title: string;
  otherEvents?: CalendarEvent[];
  calendars?: Calendar[];
  attendeeBusySlots?: Record<string, BusySlot[]>;
  /** The date being edited (yyyy-MM-dd) for filtering busy slots */
  currentDate?: string;
  /** Original event being edited (for self-exclusion in conflict check) */
  editingEvent?: CalendarEvent | null;
}

function DayTimeline({
  startTime,
  durationMinutes,
  color,
  onStartTimeChange,
  onDurationChange,
  title,
  otherEvents,
  calendars,
  attendeeBusySlots,
  currentDate,
  editingEvent,
}: DayTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    type: "move" | "resize-top" | "resize-bottom";
    initialY: number;
    initialStartMinutes: number;
    initialDuration: number;
  } | null>(null);

  const [sh, sm] = startTime.split(":").map(Number);
  const startMinutes = sh * 60 + sm;

  const totalHeight = TIMELINE_HOURS.length * HOUR_HEIGHT;

  // Position of the event block relative to the timeline
  const eventTopMinutes = startMinutes - TIMELINE_START_HOUR * 60;
  const eventTop = (eventTopMinutes / 60) * HOUR_HEIGHT;
  const eventHeight = (durationMinutes / 60) * HOUR_HEIGHT;

  const clampStartMinutes = useCallback(
    (mins: number, dur: number) => {
      const minStart = TIMELINE_START_HOUR * 60;
      const maxStart = (TIMELINE_END_HOUR + 1) * 60 - dur;
      return Math.max(minStart, Math.min(maxStart, mins));
    },
    [],
  );

  const minutesToTimeString = useCallback((totalMins: number) => {
    // Snap to 15-minute increments
    const snapped = Math.round(totalMins / 15) * 15;
    const h = Math.floor(snapped / 60) % 24;
    const m = snapped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "resize-top" | "resize-bottom") => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragState({
        type,
        initialY: e.clientY,
        initialStartMinutes: startMinutes,
        initialDuration: durationMinutes,
      });
    },
    [startMinutes, durationMinutes],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState || !containerRef.current) return;
      const deltaY = e.clientY - dragState.initialY;
      const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;

      if (dragState.type === "move") {
        const newStart = clampStartMinutes(
          dragState.initialStartMinutes + deltaMinutes,
          dragState.initialDuration,
        );
        onStartTimeChange(minutesToTimeString(newStart));
      } else if (dragState.type === "resize-top") {
        const newStart = dragState.initialStartMinutes + deltaMinutes;
        const newDuration = dragState.initialDuration - deltaMinutes;
        if (newDuration >= MIN_DURATION_MINUTES && newStart >= TIMELINE_START_HOUR * 60) {
          onStartTimeChange(minutesToTimeString(newStart));
          onDurationChange(Math.round(newDuration / 15) * 15);
        }
      } else if (dragState.type === "resize-bottom") {
        const newDuration = dragState.initialDuration + deltaMinutes;
        const maxDuration = (TIMELINE_END_HOUR + 1) * 60 - dragState.initialStartMinutes;
        if (newDuration >= MIN_DURATION_MINUTES && newDuration <= maxDuration) {
          onDurationChange(Math.round(newDuration / 15) * 15);
        }
      }
    },
    [dragState, clampStartMinutes, minutesToTimeString, onStartTimeChange, onDurationChange],
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  const formatHourLabel = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12} ${ampm}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{
        height: attendeeBusySlots && Object.keys(attendeeBusySlots).length > 0
          ? totalHeight + 60
          : totalHeight,
        cursor: dragState ? "grabbing" : undefined,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Hour rows */}
      {TIMELINE_HOURS.map((hour, i) => (
        <div
          key={hour}
          className="absolute w-full flex items-start border-b-secondary"
          style={{
            top: i * HOUR_HEIGHT,
            height: HOUR_HEIGHT,
          }}
        >
          <span
            className="text-[10px] w-12 text-right pr-2 pt-0.5 shrink-0 text-tertiary"
          >
            {formatHourLabel(hour)}
          </span>
        </div>
      ))}

      {/* Other events on this day (non-interactive background) */}
      {otherEvents?.map((evt) => {
        const evtStart = parseISO(evt.start);
        const evtStartMins = evtStart.getHours() * 60 + evtStart.getMinutes();
        const evtDuration = parseDurationMinutes(evt.duration);
        const evtTopMins = evtStartMins - TIMELINE_START_HOUR * 60;
        const evtTop = (evtTopMins / 60) * HOUR_HEIGHT;
        const evtHeight = (evtDuration / 60) * HOUR_HEIGHT;
        if (evtTop + evtHeight < 0 || evtTop > totalHeight) return null;
        const evtColor = getEventColor(evt, calendars ?? []);
        return (
          <div
            key={evt.id}
            className="absolute rounded-md overflow-hidden pointer-events-none"
            style={{
              top: Math.max(0, evtTop),
              left: 52,
              right: 8,
              height: Math.max(evtHeight, (MIN_DURATION_MINUTES / 60) * HOUR_HEIGHT),
              backgroundColor: evtColor + "18",
              border: `1px dashed ${evtColor}50`,
              zIndex: 5,
            }}
          >
            <div className="px-2 pt-1">
              <div
                className="text-[10px] font-medium truncate"
                style={{ color: evtColor, opacity: 0.7 }}
              >
                {evt.title}
              </div>
              <div
                className="text-[9px]"
                style={{ color: evtColor, opacity: 0.5 }}
              >
                {format(evtStart, "HH:mm")}
              </div>
            </div>
          </div>
        );
      })}

      {/* Busy slot bars removed — free/busy is now shown as badges on attendee names */}

      {/* Event block — red border if conflicts with attendee busy slots */}
      {(() => {
        const eventEndMinutes = startMinutes + durationMinutes;
        // Compute original event time for self-exclusion (same logic as attendee badges)
        let origStartMins2 = -1;
        let origDur2 = -1;
        let origDate2 = "";
        if (editingEvent) {
          const origStart2 = new Date(editingEvent.start);
          origStartMins2 = origStart2.getHours() * 60 + origStart2.getMinutes();
          origDur2 = parseDurationMinutes(editingEvent.duration);
          origDate2 = format(origStart2, "yyyy-MM-dd");
        }
        const hasConflict = attendeeBusySlots && currentDate && Object.values(attendeeBusySlots).some((slots) =>
          slots.some((slot) => {
            const slotStart = new Date(slot.start);
            const slotDate = format(slotStart, "yyyy-MM-dd");
            if (slotDate !== currentDate) return false;
            const slotStartMins = slotStart.getHours() * 60 + slotStart.getMinutes();
            const slotDur = parseDurationMinutes(slot.duration);
            const slotEndMins = slotStartMins + slotDur;
            // Exclude the event being edited
            if (editingEvent && slotDate === origDate2 && slotStartMins === origStartMins2 && slotDur === origDur2) return false;
            return startMinutes < slotEndMins && eventEndMinutes > slotStartMins;
          }),
        );
        const borderColor = hasConflict ? "#ef4444" : color;

        return eventTop >= -HOUR_HEIGHT && eventTop < totalHeight && (
          <div
            className="absolute rounded-md flex flex-col overflow-hidden"
            style={{
              top: Math.max(0, eventTop),
              left: 52,
              right: 8,
              height: Math.max(eventHeight, (MIN_DURATION_MINUTES / 60) * HOUR_HEIGHT),
              backgroundColor: (hasConflict ? "#ef4444" : color) + "20",
              border: `2px solid ${borderColor}`,
              cursor: dragState?.type === "move" ? "grabbing" : "grab",
              zIndex: 10,
              userSelect: "none",
            }}
            onPointerDown={(e) => handlePointerDown(e, "move")}
          >
            {/* Top resize handle */}
            <div
              className="absolute top-0 left-0 right-0 flex justify-center"
              style={{ height: 8, cursor: "ns-resize", zIndex: 11 }}
              onPointerDown={(e) => handlePointerDown(e, "resize-top")}
            >
              <div
                className="w-8 rounded-full"
                style={{ height: 3, marginTop: 2, backgroundColor: borderColor, opacity: 0.6 }}
              />
            </div>

            {/* Event content */}
            <div className="flex-1 px-2 pt-2.5 pb-1 min-h-0">
              <div
                className="text-[11px] font-medium truncate"
                style={{ color: borderColor }}
              >
                {title || "New event"}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: borderColor, opacity: 0.7 }}
              >
                {startTime} - {(() => {
                  const total = sh * 60 + sm + durationMinutes;
                  const eh = Math.floor(total / 60) % 24;
                  const em = total % 60;
                  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                })()}
              </div>
              {hasConflict && (
                <div className="text-[9px] mt-0.5 font-medium text-danger">
                  Conflict
                </div>
              )}
            </div>

            {/* Bottom resize handle */}
            <div
              className="absolute bottom-0 left-0 right-0 flex justify-center"
              style={{ height: 8, cursor: "ns-resize", zIndex: 11 }}
              onPointerDown={(e) => handlePointerDown(e, "resize-bottom")}
            >
              <div
                className="w-8 rounded-full"
                style={{ height: 3, marginBottom: 2, backgroundColor: borderColor, opacity: 0.6 }}
              />
            </div>
          </div>
        );
      })()}

      {/* Legend and free slot suggestion removed — Free/Busy badges on attendee names are clearer */}
    </div>
  );
}
