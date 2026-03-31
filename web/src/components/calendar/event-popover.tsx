/** Event detail popover */

import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { X, Edit2, Trash2, MapPin, Clock, Calendar as CalendarIcon, Users, Check, HelpCircle, Video } from "lucide-react";
import type { CalendarEvent, Calendar, Participant } from "@/types/calendar.ts";
import { format, parseISO, getEventColor, formatEventTime } from "@/hooks/use-calendar.ts";
import { useTranslation } from "react-i18next";

interface EventPopoverProps {
  event: CalendarEvent | null;
  anchor: HTMLElement | null;
  calendars: Calendar[];
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

function RsvpIcon({ status }: { status?: Participant["participationStatus"] }) {
  switch (status) {
    case "accepted":
      return (
        <Check size={12} style={{ color: "var(--color-success)" }} />
      );
    case "declined":
      return (
        <X size={12} style={{ color: "var(--color-danger)" }} />
      );
    case "tentative":
      return (
        <HelpCircle size={12} style={{ color: "var(--color-warning)" }} />
      );
    case "needs-action":
    default:
      return (
        <Clock size={12} style={{ color: "var(--color-text-tertiary)" }} />
      );
  }
}

function rsvpLabel(status: Participant["participationStatus"] | undefined, t: (key: string) => string): string {
  switch (status) {
    case "accepted":
      return t("calendar.accepted");
    case "declined":
      return t("calendar.declined");
    case "tentative":
      return t("calendar.tentative");
    case "needs-action":
    default:
      return t("calendar.needsAction");
  }
}

export const EventPopover = React.memo(function EventPopover({
  event,
  anchor,
  calendars,
  onClose,
  onEdit,
  onDelete,
}: EventPopoverProps) {
  const { t } = useTranslation();
  if (!event || !anchor) return null;

  const color = getEventColor(event, calendars);
  const calendarId = Object.keys(event.calendarIds)[0];
  const calendar = calendars.find((c) => c.id === calendarId);
  const timeStr = formatEventTime(event);
  const startDate = parseISO(event.start);

  const participants = event.participants
    ? Object.values(event.participants).filter((p) => p.roles?.attendee)
    : [];

  return (
    <Popover.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Popover.Anchor virtualRef={{ current: anchor }} />
      <Popover.Portal>
        <Popover.Content
          className="rounded-lg shadow-xl w-96 z-50 overflow-hidden bg-elevated border-primary"
          sideOffset={8}
          align="start"
          onEscapeKeyDown={onClose}
        >
          {/* Color bar */}
          <div className="h-1.5" style={{ backgroundColor: color }} />

          <div className="p-4">
            {/* Title and actions */}
            <div className="flex items-start justify-between mb-3">
              <h3
                className="text-sm font-semibold flex-1 pr-2 text-primary"
              >
                {event.title}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-tertiary"
                  onClick={() => onEdit(event)}
                  title={t("calendar.editEventBtn")}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-danger"
                  onClick={() => onDelete(event.id)}
                  title={t("calendar.deleteEvent")}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-tertiary"
                  onClick={onClose}
                  title={t("calendar.close")}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Wave Meeting badge */}
            {event.description?.includes("[wave-meeting]") && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium mb-3"
                style={{ backgroundColor: "var(--color-indigo-bg)", color: "var(--color-indigo)", border: "1px solid rgba(99,102,241,0.15)" }}>
                <Video size={12} />
                {t("calendar.waveMeeting")}
              </div>
            )}

            {/* Details */}
            <div className="flex flex-col gap-2 text-sm">
              {/* Date and time */}
              <div className="flex items-center gap-2">
                <Clock
                  size={13}
                  className="text-tertiary"
                />
                <span className="text-secondary">
                  {format(startDate, "EEE, MMM d, yyyy")}
                  {!event.showWithoutTime && (
                    <>
                      {" "}
                      &middot; {timeStr}
                    </>
                  )}
                </span>
              </div>

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin
                    size={13}
                    className="text-tertiary"
                  />
                  <span className="text-secondary">
                    {event.location}
                  </span>
                </div>
              )}

              {/* Calendar */}
              {calendar && (
                <div className="flex items-center gap-2">
                  <CalendarIcon
                    size={13}
                    className="text-tertiary"
                  />
                  <span className="text-secondary">
                    {calendar.name}
                  </span>
                </div>
              )}

              {/* Status */}
              {event.status && event.status !== "confirmed" && (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${event.status === "tentative" ? "pill--warning" : "pill--danger"}`}
                  >
                    {event.status}
                  </span>
                </div>
              )}

              {/* Recurrence */}
              {event.recurrenceRules && event.recurrenceRules.length > 0 && (
                <div
                  className="text-xs text-tertiary"
                >
                  {t("calendar.repeats", { frequency: event.recurrenceRules[0].frequency })}
                  {event.recurrenceRules[0].interval && event.recurrenceRules[0].interval > 1
                    ? ` every ${event.recurrenceRules[0].interval} ${event.recurrenceRules[0].frequency === "daily" ? "days" : event.recurrenceRules[0].frequency === "weekly" ? "weeks" : event.recurrenceRules[0].frequency === "monthly" ? "months" : "years"}`
                    : ""}
                </div>
              )}

              {/* Participants with RSVP status */}
              {participants.length > 0 && (
                <div className="flex items-start gap-2 mt-1">
                  <Users
                    size={13}
                    className="mt-0.5 shrink-0 text-tertiary"
                  />
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-[10px] font-medium uppercase tracking-wide text-tertiary"
                    >
                      {t("calendar.attendees")}
                    </span>
                    {participants.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 text-xs text-secondary"
                      >
                        <RsvpIcon status={p.participationStatus} />
                        <span className="truncate">
                          {p.name ?? p.email}
                        </span>
                        <span
                          className="ml-auto shrink-0 text-[10px] text-tertiary"
                        >
                          {rsvpLabel(p.participationStatus, t)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {event.description && (() => {
                const displayDescription = event.description.replace("[wave-meeting]", "").trim();
                return displayDescription ? (
                  <div
                    className="text-xs mt-1 whitespace-pre-wrap text-tertiary"
                  >
                    {displayDescription.length > 200
                      ? displayDescription.substring(0, 200) + "..."
                      : displayDescription}
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
