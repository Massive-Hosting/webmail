/** Agenda sidebar showing today's events */

import React, { useMemo, useCallback, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import type { CalendarEvent, Calendar } from "@/types/calendar.ts";
import {
  format,
  parseISO,
  isToday,
  isEventOnDay,
  getEventColor,
  formatEventTime,
  getEventEnd,
} from "@/hooks/use-calendar.ts";
import { useCalendars, useCalendarEvents } from "@/hooks/use-calendar.ts";
import { useUIStore } from "@/stores/ui-store.ts";

interface AgendaSidebarProps {
  onNavigateToEvent?: (event: CalendarEvent) => void;
}

export const AgendaSidebar = React.memo(function AgendaSidebar({
  onNavigateToEvent,
}: AgendaSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("agendaSidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });

  const { calendars } = useCalendars();

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const { events } = useCalendarEvents(
    calendars.map((c) => c.id),
    {
      start: todayStart.toISOString(),
      end: todayEnd.toISOString(),
    },
  );

  const todayEvents = useMemo(() => {
    return events
      .filter((e) => isEventOnDay(e, todayStart))
      .sort((a, b) => {
        if (a.showWithoutTime && !b.showWithoutTime) return -1;
        if (!a.showWithoutTime && b.showWithoutTime) return 1;
        return a.start.localeCompare(b.start);
      });
  }, [events, todayStart]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("agendaSidebarCollapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (onNavigateToEvent) {
        onNavigateToEvent(event);
      }
    },
    [onNavigateToEvent],
  );

  // Determine current/next event
  const now = new Date();
  const currentOrNextId = useMemo(() => {
    for (const event of todayEvents) {
      if (event.showWithoutTime) continue;
      const start = parseISO(event.start);
      const end = getEventEnd(event);
      if (now >= start && now <= end) return event.id;
      if (start > now) return event.id;
    }
    return null;
  }, [todayEvents, now]);

  return (
    <div
      className="shrink-0 overflow-hidden flex flex-col"
      style={{
        borderTop: "1px solid var(--color-border-secondary)",
      }}
    >
      {/* Header */}
      <button
        className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
        onClick={toggleCollapse}
      >
        {collapsed ? (
          <ChevronRight
            size={14}
            style={{ color: "var(--color-text-tertiary)" }}
          />
        ) : (
          <ChevronDown
            size={14}
            style={{ color: "var(--color-text-tertiary)" }}
          />
        )}
        <CalendarIcon
          size={14}
          style={{ color: "var(--color-text-accent)" }}
        />
        <span
          className="text-xs font-medium flex-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Today's Schedule
        </span>
        <span
          className="text-[10px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {format(today, "MMM d")}
        </span>
      </button>

      {/* Events */}
      {!collapsed && (
        <div className="flex flex-col overflow-y-auto max-h-48 px-1 pb-2">
          {todayEvents.length === 0 ? (
            <div
              className="px-3 py-3 text-xs text-center"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No events today
            </div>
          ) : (
            todayEvents.map((event) => {
              const color = getEventColor(event, calendars);
              const isCurrent = event.id === currentOrNextId;

              return (
                <button
                  key={event.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  style={{
                    backgroundColor: isCurrent
                      ? "var(--color-bg-tertiary)"
                      : undefined,
                  }}
                  onClick={() => handleEventClick(event)}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-medium truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {event.title}
                    </div>
                    <div
                      className="text-[10px] truncate"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {formatEventTime(event)}
                      {event.location && ` \u00B7 ${event.location}`}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});
