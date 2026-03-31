/** Calendar invitation card for .ics attachments in email messages */

import React, { useState, useMemo } from "react";
import {
  CalendarDays,
  MapPin,
  User,
  Users,
  Check,
  HelpCircle,
  XCircle,
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
import { createCalendarEvent, sendInvitationReply } from "@/api/calendar.ts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCalendars } from "@/api/calendar.ts";
import { useAuthStore } from "@/stores/auth-store.ts";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { data: invitation, isLoading, error } = useQuery({
    queryKey: ["ics-invitation", blobId],
    queryFn: () => fetchIcsContent(blobId),
    staleTime: Infinity,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 mx-6 my-3 p-4 rounded-lg text-sm bg-secondary border-primary text-secondary"
      >
        <Loader2 size={16} className="animate-spin" />
        {t("invitation.loadingInvitation")}
      </div>
    );
  }

  if (error || !invitation || invitation.events.length === 0) {
    return null;
  }

  const cancelled = isCancellation(invitation);
  const isReply = invitation.method === "REPLY";
  const event = invitation.events[0];

  if (cancelled) {
    return <CancellationCard event={event} />;
  }

  if (isReply) {
    return <ReplyCard event={event} />;
  }

  return <RequestCard event={event} method={invitation.method} />;
});

/** Card for a new event invitation (METHOD:REQUEST or PUBLISH) */
function RequestCard({
  event,
  method,
}: {
  event: ParsedVEvent;
  method: ParsedInvitation["method"];
}) {
  const { t } = useTranslation();
  const [respondedStatus, setRespondedStatus] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);

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
        accepted: t("invitation.eventAccepted"),
        tentative: t("invitation.tentativeAccepted"),
        declined: t("invitation.invitationDeclined"),
      };
      toast.success(labels[status] ?? "Response sent");
      // Send REPLY email back to organizer (fire-and-forget)
      sendInvitationReply(event, status as "accepted" | "declined" | "tentative", email, displayName).catch(() => {});
    },
    onError: (error: Error) => {
      toast.error(t("invitation.failedToRespond", { message: error.message }));
    },
  });

  const dateTimeStr = formatEventDateTime(event);

  return (
    <div
      className="mx-6 my-3 rounded-lg overflow-hidden border-primary bg-primary"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 bg-accent text-inverse"
      >
        <CalendarDays size={16} />
        <span className="text-sm font-medium">
          {method === "REQUEST" ? t("invitation.meetingInvitation") : t("invitation.calendarEvent")}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {/* Title */}
        <h3
          className="text-base font-semibold text-primary"
        >
          {event.summary || t("invitation.untitledEvent")}
        </h3>

        {/* Date/Time */}
        <div className="flex items-center gap-2">
          <CalendarDays
            size={14}
            className="shrink-0 text-tertiary"
          />
          <span
            className="text-sm text-secondary"
          >
            {dateTimeStr}
          </span>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin
              size={14}
              className="shrink-0 text-tertiary"
            />
            <span
              className="text-sm text-secondary"
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
              className="shrink-0 text-tertiary"
            />
            <span
              className="text-sm text-secondary"
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
              className="shrink-0 mt-0.5 text-tertiary"
            />
            <span
              className="text-sm text-secondary"
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
            className="text-sm mt-1 whitespace-pre-wrap text-secondary"
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
          className="flex items-center gap-2 px-4 py-2.5 text-sm border-t-secondary text-secondary"
        >
          <Check size={14} className="text-accent" />
          {respondedStatus === "accepted" && t("invitation.accepted")}
          {respondedStatus === "tentative" && t("invitation.tentativelyAccepted")}
          {respondedStatus === "declined" && t("invitation.declined")}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-t-secondary"
        >
          <button
            onClick={() => acceptMutation.mutate("accepted")}
            disabled={acceptMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-accent text-inverse"
          >
            <Check size={14} />
            {t("invitation.accept")}
          </button>
          <button
            onClick={() => acceptMutation.mutate("tentative")}
            disabled={acceptMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-tertiary text-primary border-primary"
          >
            <HelpCircle size={14} />
            {t("invitation.tentative")}
          </button>
          <button
            onClick={() => acceptMutation.mutate("declined")}
            disabled={acceptMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-tertiary text-primary border-primary"
          >
            <XCircle size={14} />
            {t("invitation.decline")}
          </button>
          {acceptMutation.isPending && (
            <Loader2
              size={14}
              className="animate-spin text-tertiary"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Card for a cancelled event (METHOD:CANCEL) */
/** Card for a REPLY — shows who responded and their status */
function ReplyCard({ event }: { event: ParsedVEvent }) {
  const { t } = useTranslation();
  const dateTimeStr = formatEventDateTime(event);

  // In a REPLY, attendees contain the person who responded with their status
  const respondent = event.attendees[0];
  const respondentName = respondent?.name || respondent?.email || "Someone";
  const status = respondent?.status ?? "unknown";

  const statusLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    accepted: { label: t("calendar.accepted"), color: "var(--color-success)", icon: <Check size={14} /> },
    declined: { label: t("calendar.declined"), color: "#ef4444", icon: <XCircle size={14} /> },
    tentative: { label: t("calendar.tentative"), color: "#f59e0b", icon: <HelpCircle size={14} /> },
  };

  const statusInfo = statusLabels[status] ?? { label: status, color: "#78716c", icon: <HelpCircle size={14} /> };

  return (
    <div
      className="mx-6 my-3 rounded-lg overflow-hidden border-primary bg-primary"
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b-secondary bg-tertiary"
      >
        <CalendarDays size={16} className="text-accent" />
        <span className="text-sm font-semibold text-primary">
          {t("invitation.calendarEvent")}
        </span>
        <span
          className="ml-auto flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${statusInfo.color}15`, color: statusInfo.color }}
        >
          {statusInfo.icon}
          {statusInfo.label}
        </span>
      </div>

      <div className="p-4 space-y-2">
        <div className="text-sm font-semibold text-primary">
          {event.summary || t("invitation.untitledEvent")}
        </div>
        <div className="flex items-center gap-2 text-xs text-secondary">
          <CalendarDays size={13} />
          {dateTimeStr}
        </div>
        <div
          className="flex items-center gap-2 text-xs mt-2 pt-2 text-secondary border-t-secondary"
        >
          <User size={13} />
          <span>
            <strong className="text-primary">{respondentName}</strong>
            {" "}{statusInfo.label.toLowerCase()} {t("invitation.calendarEvent").toLowerCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

function CancellationCard({ event }: { event: ParsedVEvent }) {
  const { t } = useTranslation();

  const dateTimeStr = formatEventDateTime(event);

  // We don't have the JMAP event ID from the .ics, so we can't directly
  // look it up. Show an informational card.

  return (
    <div
      className="mx-6 my-3 rounded-lg overflow-hidden border-primary bg-primary"
    >
      {/* Header - Cancellation */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          backgroundColor: "var(--color-danger-dark)",
          color: "white",
        }}
      >
        <XCircle size={16} />
        <span className="text-sm font-medium">{t("invitation.eventCancelled")}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <h3
          className="text-base font-semibold text-primary"
          style={{ textDecoration: "line-through" }}
        >
          {event.summary || t("invitation.untitledEvent")}
        </h3>

        <div className="flex items-center gap-2">
          <CalendarDays
            size={14}
            className="text-tertiary"
          />
          <span
            className="text-sm text-secondary"
            style={{ textDecoration: "line-through" }}
          >
            {dateTimeStr}
          </span>
        </div>

        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin
              size={14}
              className="text-tertiary"
            />
            <span
              className="text-sm text-secondary"
              style={{ textDecoration: "line-through" }}
            >
              {event.location}
            </span>
          </div>
        )}

        {event.organizer && (
          <div className="flex items-center gap-2">
            <User
              size={14}
              className="text-tertiary"
            />
            <span
              className="text-sm text-secondary"
            >
              {t("invitation.cancelledBy", { name: event.organizer.name ?? event.organizer.email })}
            </span>
          </div>
        )}

        <p
          className="text-sm font-medium mt-1"
          style={{ color: "var(--color-danger-dark)" }}
        >
          {t("invitation.eventHasBeenCancelled")}
        </p>
      </div>
    </div>
  );
}
