/** Calendar invitation card for .ics attachments in email messages */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarDays,
  MapPin,
  User,
  Users,
  Check,
  HelpCircle,
  XCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  parseICalendar,
  isCancellation,
  vEventToCalendarEvent,
  formatEventDateTime,
  type ParsedInvitation,
  type ParsedVEvent,
} from "@/lib/icalendar.ts";
import { createCalendarEvent, deleteCalendarEvent } from "@/api/calendar.ts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCalendars } from "@/api/calendar.ts";
import { toast } from "sonner";

interface InvitationCardProps {
  blobId: string;
}

/** Fetch and parse .ics content from a blob */
async function fetchIcsContent(blobId: string): Promise<ParsedInvitation> {
  const response = await fetch(`/api/blob/${blobId}`, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch calendar attachment");
  }

  const text = await response.text();
  return parseICalendar(text);
}

export const InvitationCard = React.memo(function InvitationCard({
  blobId,
}: InvitationCardProps) {
  const { data: invitation, isLoading, error } = useQuery({
    queryKey: ["ics-invitation", blobId],
    queryFn: () => fetchIcsContent(blobId),
    staleTime: Infinity,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 mx-6 my-3 p-4 rounded-lg text-sm"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-primary)",
          color: "var(--color-text-secondary)",
        }}
      >
        <Loader2 size={16} className="animate-spin" />
        Loading calendar invitation...
      </div>
    );
  }

  if (error || !invitation || invitation.events.length === 0) {
    return null;
  }

  const cancelled = isCancellation(invitation);
  const event = invitation.events[0];

  return cancelled ? (
    <CancellationCard event={event} />
  ) : (
    <RequestCard event={event} method={invitation.method} />
  );
});

/** Card for a new event invitation (METHOD:REQUEST or PUBLISH) */
function RequestCard({
  event,
  method,
}: {
  event: ParsedVEvent;
  method: ParsedInvitation["method"];
}) {
  const [respondedStatus, setRespondedStatus] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: calendars } = useQuery({
    queryKey: ["calendars"],
    queryFn: fetchCalendars,
    staleTime: 5 * 60 * 1000,
  });

  const defaultCalendarId = useMemo(() => {
    if (!calendars || calendars.length === 0) return null;
    const defaultCal = calendars.find((c) => c.isDefault);
    return defaultCal?.id ?? calendars[0].id;
  }, [calendars]);

  const acceptMutation = useMutation({
    mutationFn: async (status: "accepted" | "tentative" | "declined") => {
      if (!defaultCalendarId) {
        throw new Error("No calendar available");
      }

      if (status === "declined") {
        // For decline, we don't create the event
        return status;
      }

      // Convert to JMAP CalendarEvent and create it
      const calEvent = vEventToCalendarEvent(event, defaultCalendarId);

      // Set status to tentative if needed
      if (status === "tentative") {
        calEvent.status = "tentative";
        calEvent.freeBusyStatus = "tentative";
      }

      await createCalendarEvent(calEvent);
      return status;
    },
    onSuccess: (status) => {
      setRespondedStatus(status);
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
      const labels: Record<string, string> = {
        accepted: "Event accepted and added to calendar",
        tentative: "Tentatively accepted and added to calendar",
        declined: "Invitation declined",
      };
      toast.success(labels[status] ?? "Response sent");
    },
    onError: (error: Error) => {
      toast.error(`Failed to respond: ${error.message}`);
    },
  });

  const dateTimeStr = formatEventDateTime(event);

  return (
    <div
      className="mx-6 my-3 rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--color-border-primary)",
        backgroundColor: "var(--color-bg-secondary)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          backgroundColor: "var(--color-bg-accent)",
          color: "var(--color-text-inverse)",
        }}
      >
        <CalendarDays size={16} />
        <span className="text-sm font-medium">
          {method === "REQUEST" ? "Meeting Invitation" : "Calendar Event"}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {/* Title */}
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {event.summary || "Untitled Event"}
        </h3>

        {/* Date/Time */}
        <div className="flex items-center gap-2">
          <CalendarDays
            size={14}
            style={{ color: "var(--color-text-tertiary)" }}
            className="shrink-0"
          />
          <span
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {dateTimeStr}
          </span>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
              className="shrink-0"
            />
            <span
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {event.location}
            </span>
          </div>
        )}

        {/* Organizer */}
        {event.organizer && (
          <div className="flex items-center gap-2">
            <User
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
              className="shrink-0"
            />
            <span
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {event.organizer.name
                ? `${event.organizer.name} (${event.organizer.email})`
                : event.organizer.email}
            </span>
          </div>
        )}

        {/* Attendees */}
        {event.attendees.length > 0 && (
          <div className="flex items-start gap-2">
            <Users
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
              className="shrink-0 mt-0.5"
            />
            <span
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {event.attendees
                .map((a) => a.name ?? a.email)
                .join(", ")}
            </span>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <p
            className="text-sm mt-1 whitespace-pre-wrap"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {event.description.length > 200
              ? event.description.slice(0, 200) + "..."
              : event.description}
          </p>
        )}
      </div>

      {/* Actions */}
      {respondedStatus ? (
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-sm"
          style={{
            borderTop: "1px solid var(--color-border-secondary)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Check size={14} style={{ color: "var(--color-text-accent)" }} />
          {respondedStatus === "accepted" && "Accepted - added to your calendar"}
          {respondedStatus === "tentative" && "Tentatively accepted - added to your calendar"}
          {respondedStatus === "declined" && "Declined"}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderTop: "1px solid var(--color-border-secondary)" }}
        >
          <button
            onClick={() => acceptMutation.mutate("accepted")}
            disabled={acceptMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              color: "var(--color-text-inverse)",
            }}
          >
            <Check size={14} />
            Accept
          </button>
          <button
            onClick={() => acceptMutation.mutate("tentative")}
            disabled={acceptMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
            }}
          >
            <HelpCircle size={14} />
            Tentative
          </button>
          <button
            onClick={() => acceptMutation.mutate("declined")}
            disabled={acceptMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
            }}
          >
            <XCircle size={14} />
            Decline
          </button>
          {acceptMutation.isPending && (
            <Loader2
              size={14}
              className="animate-spin"
              style={{ color: "var(--color-text-tertiary)" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Card for a cancelled event (METHOD:CANCEL) */
function CancellationCard({ event }: { event: ParsedVEvent }) {
  const [removed, setRemoved] = useState(false);
  const queryClient = useQueryClient();

  const dateTimeStr = formatEventDateTime(event);

  // We don't have the JMAP event ID from the .ics, so we can't directly
  // look it up. Show an informational card.

  return (
    <div
      className="mx-6 my-3 rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--color-border-primary)",
        backgroundColor: "var(--color-bg-secondary)",
      }}
    >
      {/* Header - Cancellation */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          backgroundColor: "#dc2626",
          color: "white",
        }}
      >
        <XCircle size={16} />
        <span className="text-sm font-medium">Event Cancelled</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <h3
          className="text-base font-semibold"
          style={{
            color: "var(--color-text-primary)",
            textDecoration: "line-through",
          }}
        >
          {event.summary || "Untitled Event"}
        </h3>

        <div className="flex items-center gap-2">
          <CalendarDays
            size={14}
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <span
            className="text-sm"
            style={{
              color: "var(--color-text-secondary)",
              textDecoration: "line-through",
            }}
          >
            {dateTimeStr}
          </span>
        </div>

        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
            />
            <span
              className="text-sm"
              style={{
                color: "var(--color-text-secondary)",
                textDecoration: "line-through",
              }}
            >
              {event.location}
            </span>
          </div>
        )}

        {event.organizer && (
          <div className="flex items-center gap-2">
            <User
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
            />
            <span
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Cancelled by{" "}
              {event.organizer.name ?? event.organizer.email}
            </span>
          </div>
        )}

        <p
          className="text-sm font-medium mt-1"
          style={{ color: "#dc2626" }}
        >
          This event has been cancelled.
        </p>
      </div>
    </div>
  );
}
