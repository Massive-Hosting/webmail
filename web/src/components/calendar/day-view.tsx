/** Day view: Single column with hourly rows */

import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent, Calendar } from "@/types/calendar.ts";
import {
  isToday,
  format,
  parseISO,
  getEventColor,
  parseDurationMinutes,
  isEventOnDay,
} from "@/hooks/use-calendar.ts";

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onClickSlot: (date: Date, hour: number) => void;
  onClickEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
  onEventTimeChange?: (event: CalendarEvent, newStart: string) => void;
}

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 64;
const TOTAL_HOURS = END_HOUR - START_HOUR;

export const DayView = React.memo(function DayView({
  currentDate,
  events,
  calendars,
  onClickSlot,
  onClickEvent,
  onEventTimeChange,
}: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = isToday(currentDate);

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    const timed: CalendarEvent[] = [];

    for (const event of events) {
      if (!isEventOnDay(event, currentDate)) continue;
      if (event.showWithoutTime) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    }

    timed.sort((a, b) => a.start.localeCompare(b.start));
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events, currentDate]);

  // Position timed events (handle overlaps)
  const positioned = useMemo(() => {
    if (timedEvents.length === 0) return [];
    const result: Array<{
      event: CalendarEvent;
      top: number;
      height: number;
      left: string;
      width: string;
    }> = [];

    const groups: CalendarEvent[][] = [];
    let currentGroup: CalendarEvent[] = [];
    let groupEnd = 0;

    for (const event of timedEvents) {
      const start = parseISO(event.start);
      const startMin =
        (start.getHours() - START_HOUR) * 60 + start.getMinutes();
      const durationMin = parseDurationMinutes(event.duration);
      const endMin = startMin + durationMin;

      if (currentGroup.length > 0 && startMin < groupEnd) {
        currentGroup.push(event);
        groupEnd = Math.max(groupEnd, endMin);
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [event];
        groupEnd = endMin;
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    for (const group of groups) {
      const cols = group.length;
      group.forEach((event, col) => {
        const start = parseISO(event.start);
        const startMin =
          (start.getHours() - START_HOUR) * 60 + start.getMinutes();
        const durationMin = parseDurationMinutes(event.duration);

        const top = Math.max(0, (startMin / 60) * HOUR_HEIGHT);
        const height = Math.max(24, (durationMin / 60) * HOUR_HEIGHT);
        const widthPct = 100 / cols;

        result.push({
          event,
          top,
          height,
          left: `${col * widthPct}%`,
          width: `${widthPct}%`,
        });
      });
    }

    return result;
  }, [timedEvents]);

  // Scroll to current time
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const minutesSinceStart =
        (now.getHours() - START_HOUR) * 60 + now.getMinutes();
      const scrollTop = Math.max(
        0,
        (minutesSinceStart / 60) * HOUR_HEIGHT - 100,
      );
      scrollRef.current.scrollTop = scrollTop;
    }
  }, []);

  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      result.push(h);
    }
    return result;
  }, []);

  // Drag state for moving events
  const [dragState, setDragState] = useState<{
    eventId: string;
    initialY: number;
    initialStartMinutes: number;
    currentDeltaMinutes: number;
  } | null>(null);

  const handleSlotClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragState) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const hour = Math.floor(y / HOUR_HEIGHT) + START_HOUR;
      onClickSlot(currentDate, Math.min(hour, END_HOUR - 1));
    },
    [currentDate, onClickSlot, dragState],
  );

  const handleDragStart = useCallback(
    (event: CalendarEvent, initialY: number) => {
      const start = parseISO(event.start);
      const startMin = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
      setDragState({
        eventId: event.id,
        initialY,
        initialStartMinutes: startMin,
        currentDeltaMinutes: 0,
      });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState) return;
      const deltaY = e.clientY - dragState.initialY;
      const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15;
      setDragState((prev) => prev ? { ...prev, currentDeltaMinutes: deltaMinutes } : null);
    },
    [dragState],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState || !onEventTimeChange) {
        setDragState(null);
        return;
      }

      if (dragState.currentDeltaMinutes !== 0) {
        const draggedEvent = timedEvents.find((ev) => ev.id === dragState.eventId);
        if (draggedEvent) {
          const newStartMinutes = dragState.initialStartMinutes + dragState.currentDeltaMinutes;
          const clampedMinutes = Math.max(0, Math.min(newStartMinutes, (END_HOUR - START_HOUR) * 60 - 15));
          const totalMinutes = clampedMinutes + START_HOUR * 60;
          const h = Math.floor(totalMinutes / 60);
          const m = totalMinutes % 60;

          const dateStr = draggedEvent.start.substring(0, 10);
          const newStart = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
          onEventTimeChange(draggedEvent, newStart);
        }
      }

      setDragState(null);
    },
    [dragState, timedEvents, onEventTimeChange],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day header */}
      <div
        className="flex shrink-0 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-primary)" }}
      >
        <div
          className="text-sm font-medium"
          style={{
            color: today
              ? "var(--color-text-accent)"
              : "var(--color-text-primary)",
          }}
        >
          {format(currentDate, "EEEE, MMMM d")}
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div
          className="flex flex-wrap gap-1 px-4 py-2 shrink-0"
          style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
        >
          <span
            className="text-[10px] mr-2 self-center"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            all-day
          </span>
          {allDayEvents.map((event) => {
            const color = getEventColor(event, calendars);
            return (
              <button
                key={event.id}
                className="text-xs px-2 py-0.5 rounded truncate hover:opacity-80"
                style={{
                  backgroundColor: color + "20",
                  color: color,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClickEvent(event, e.currentTarget);
                }}
              >
                {event.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="flex relative"
          style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
        >
          {/* Time gutter */}
          <div className="w-16 shrink-0 relative">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[11px] -translate-y-1/2"
                style={{
                  top: (h - START_HOUR) * HOUR_HEIGHT,
                  color: "var(--color-text-tertiary)",
                }}
              >
                {format(new Date(2000, 0, 1, h), "h a")}
              </div>
            ))}
          </div>

          {/* Event area */}
          <div
            className="flex-1 relative cursor-pointer"
            onClick={handleSlotClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Hour lines */}
            {hours.map((h) => (
              <div
                key={h}
                className="absolute w-full"
                style={{
                  top: (h - START_HOUR) * HOUR_HEIGHT,
                  borderTop: "1px solid var(--color-border-secondary)",
                }}
              />
            ))}

            {/* Events */}
            {positioned.map(({ event, top, height, left, width }) => {
              const color = getEventColor(event, calendars);
              const isDragging = dragState?.eventId === event.id;
              const dragOffset = isDragging
                ? (dragState.currentDeltaMinutes / 60) * HOUR_HEIGHT
                : 0;

              return (
                <button
                  key={event.id}
                  className="absolute rounded px-2 py-1 text-left overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                  style={{
                    top: top + dragOffset,
                    height: Math.max(height - 2, 22),
                    left,
                    width,
                    backgroundColor: color + "25",
                    borderLeft: `3px solid ${color}`,
                    color: color,
                    zIndex: isDragging ? 20 : 1,
                    opacity: isDragging ? 0.85 : undefined,
                    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : undefined,
                    transition: isDragging ? "none" : "opacity 0.15s",
                    touchAction: "none",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickEvent(event, e.currentTarget);
                  }}
                  onPointerDown={(e) => {
                    if (!onEventTimeChange) return;
                    e.stopPropagation();
                    e.preventDefault();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    handleDragStart(event, e.clientY);
                  }}
                  title={event.title}
                >
                  <div className="text-sm font-medium truncate">
                    {event.title}
                  </div>
                  {height > 40 && (
                    <div className="text-xs opacity-75">
                      {format(parseISO(event.start), "h:mm a")}
                    </div>
                  )}
                  {height > 60 && event.location && (
                    <div className="text-xs opacity-60 truncate">
                      {event.location}
                    </div>
                  )}
                  {height > 80 && event.description && (
                    <div className="text-xs opacity-50 truncate mt-0.5">
                      {event.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Current time indicator */}
          {today && <DayCurrentTimeIndicator />}
        </div>
      </div>
    </div>
  );
});

function DayCurrentTimeIndicator() {
  const now = new Date();
  const minutesSinceStart =
    (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  if (minutesSinceStart < 0 || minutesSinceStart > TOTAL_HOURS * 60)
    return null;

  const top = (minutesSinceStart / 60) * HOUR_HEIGHT;

  return (
    <div
      className="absolute h-0.5 pointer-events-none z-10"
      style={{
        top,
        left: 64,
        right: 0,
        backgroundColor: "#ef4444",
      }}
    >
      <div
        className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: "#ef4444" }}
      />
    </div>
  );
}
