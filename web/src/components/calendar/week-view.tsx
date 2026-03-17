/** Week view: 7-column time grid with hourly rows */

import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent, Calendar } from "@/types/calendar.ts";
import {
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  format,
  parseISO,
  startOfDay,
  differenceInMinutes,
  getEventEnd,
  getEventColor,
  parseDurationMinutes,
  isEventOnDay,
} from "@/hooks/use-calendar.ts";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onClickSlot: (date: Date, hour: number) => void;
  onClickEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
  onEventTimeChange?: (event: CalendarEvent, newStart: string) => void;
}

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 60; // px per hour
const TOTAL_HOURS = END_HOUR - START_HOUR;

export const WeekView = React.memo(function WeekView({
  currentDate,
  events,
  calendars,
  onClickSlot,
  onClickEvent,
  onEventTimeChange,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );

  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 7; i++) {
      result.push(addDays(weekStart, i));
    }
    return result;
  }, [weekStart]);

  // Separate all-day vs timed events per day
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay = new Map<string, CalendarEvent[]>();
    const timed = new Map<string, CalendarEvent[]>();

    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      const dayAll: CalendarEvent[] = [];
      const dayTimed: CalendarEvent[] = [];

      for (const event of events) {
        if (!isEventOnDay(event, day)) continue;
        if (event.showWithoutTime) {
          dayAll.push(event);
        } else {
          dayTimed.push(event);
        }
      }

      dayTimed.sort((a, b) => a.start.localeCompare(b.start));
      if (dayAll.length > 0) allDay.set(key, dayAll);
      if (dayTimed.length > 0) timed.set(key, dayTimed);
    }

    return { allDayByDay: allDay, timedByDay: timed };
  }, [days, events]);

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const minutesSinceStart = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
      const scrollTop = Math.max(0, (minutesSinceStart / 60) * HOUR_HEIGHT - 100);
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

  const hasAnyAllDay = useMemo(
    () => days.some((d) => (allDayByDay.get(format(d, "yyyy-MM-dd"))?.length ?? 0) > 0),
    [days, allDayByDay],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header row with day names */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--color-border-primary)" }}>
        {/* Time gutter */}
        <div className="w-16 shrink-0" />
        {/* Day columns */}
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={format(day, "yyyy-MM-dd")}
              className="flex-1 text-center py-2"
              style={{
                borderLeft: "1px solid var(--color-border-secondary)",
                backgroundColor: today ? "var(--color-bg-tertiary)" : undefined,
              }}
            >
              <div
                className="text-xs font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {format(day, "EEE")}
              </div>
              <div
                className="text-lg font-semibold"
                style={{
                  color: today
                    ? "var(--color-text-accent)"
                    : "var(--color-text-primary)",
                }}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      {hasAnyAllDay && (
        <div
          className="flex shrink-0"
          style={{ borderBottom: "1px solid var(--color-border-primary)" }}
        >
          <div
            className="w-16 shrink-0 flex items-center justify-end pr-2 text-[10px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            all-day
          </div>
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = allDayByDay.get(key) ?? [];
            return (
              <div
                key={key}
                className="flex-1 flex flex-col gap-0.5 p-0.5 min-h-[28px]"
                style={{ borderLeft: "1px solid var(--color-border-secondary)" }}
              >
                {dayEvents.map((event) => (
                  <AllDayChip
                    key={event.id}
                    event={event}
                    calendars={calendars}
                    onClick={onClickEvent}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
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

          {/* Day columns */}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = timedByDay.get(key) ?? [];
            const today = isToday(day);

            return (
              <DayColumn
                key={key}
                day={day}
                today={today}
                events={dayEvents}
                calendars={calendars}
                hours={hours}
                onClickSlot={onClickSlot}
                onClickEvent={onClickEvent}
                onEventTimeChange={onEventTimeChange}
              />
            );
          })}

          {/* Hour lines */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ left: 64 }}
          >
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
          </div>

          {/* Current time indicator */}
          <CurrentTimeIndicator days={days} />
        </div>
      </div>
    </div>
  );
});

interface DayColumnProps {
  day: Date;
  today: boolean;
  events: CalendarEvent[];
  calendars: Calendar[];
  hours: number[];
  onClickSlot: (date: Date, hour: number) => void;
  onClickEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
  onEventTimeChange?: (event: CalendarEvent, newStart: string) => void;
}

const DayColumn = React.memo(function DayColumn({
  day,
  today,
  events,
  calendars,
  hours,
  onClickSlot,
  onClickEvent,
  onEventTimeChange,
}: DayColumnProps) {
  // Compute layout for overlapping events
  const positioned = useMemo(() => layoutEvents(events), [events]);

  // Drag state for moving events
  const [dragState, setDragState] = useState<{
    eventId: string;
    initialY: number;
    initialStartMinutes: number;
    currentDeltaMinutes: number;
  } | null>(null);

  const handleSlotClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't fire slot click if we just finished a drag
      if (dragState) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const hour = Math.floor(y / HOUR_HEIGHT) + START_HOUR;
      onClickSlot(day, Math.min(hour, END_HOUR - 1));
    },
    [day, onClickSlot, dragState],
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
      const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15; // snap to 15 min
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
        const draggedEvent = events.find((ev) => ev.id === dragState.eventId);
        if (draggedEvent) {
          const newStartMinutes = dragState.initialStartMinutes + dragState.currentDeltaMinutes;
          const clampedMinutes = Math.max(0, Math.min(newStartMinutes, (END_HOUR - START_HOUR) * 60 - 15));
          const totalMinutes = clampedMinutes + START_HOUR * 60;
          const h = Math.floor(totalMinutes / 60);
          const m = totalMinutes % 60;

          // Reconstruct the start datetime with the same date
          const dateStr = draggedEvent.start.substring(0, 10);
          const newStart = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
          onEventTimeChange(draggedEvent, newStart);
        }
      }

      setDragState(null);
    },
    [dragState, events, onEventTimeChange],
  );

  return (
    <div
      className="flex-1 relative cursor-pointer"
      style={{
        borderLeft: "1px solid var(--color-border-secondary)",
        backgroundColor: today ? "var(--color-bg-tertiary)" : undefined,
      }}
      onClick={handleSlotClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {positioned.map(({ event, top, height, left, width }) => {
        const isDragging = dragState?.eventId === event.id;
        const dragOffset = isDragging
          ? (dragState.currentDeltaMinutes / 60) * HOUR_HEIGHT
          : 0;

        return (
          <TimedEventBlock
            key={event.id}
            event={event}
            calendars={calendars}
            top={top + dragOffset}
            height={height}
            left={left}
            width={width}
            onClick={onClickEvent}
            onDragStart={handleDragStart}
            isDragging={isDragging}
          />
        );
      })}
    </div>
  );
});

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: string;
  width: string;
}

function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  const result: PositionedEvent[] = [];

  // Group overlapping events
  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];
  let groupEnd = 0;

  for (const event of events) {
    const start = parseISO(event.start);
    const startMin =
      (start.getHours() - START_HOUR) * 60 + start.getMinutes();
    const durationMin = parseDurationMinutes(event.duration);
    const endMin = startMin + durationMin;

    if (currentGroup.length > 0 && startMin < groupEnd) {
      currentGroup.push(event);
      groupEnd = Math.max(groupEnd, endMin);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [event];
      groupEnd = endMin;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    const columns = group.length;
    group.forEach((event, col) => {
      const start = parseISO(event.start);
      const startMin =
        (start.getHours() - START_HOUR) * 60 + start.getMinutes();
      const durationMin = parseDurationMinutes(event.duration);

      const top = Math.max(0, (startMin / 60) * HOUR_HEIGHT);
      const height = Math.max(20, (durationMin / 60) * HOUR_HEIGHT);
      const widthPct = 100 / columns;

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
}

interface TimedEventBlockProps {
  event: CalendarEvent;
  calendars: Calendar[];
  top: number;
  height: number;
  left: string;
  width: string;
  onClick: (event: CalendarEvent, anchor: HTMLElement) => void;
  onDragStart?: (event: CalendarEvent, initialY: number) => void;
  isDragging?: boolean;
}

const TimedEventBlock = React.memo(function TimedEventBlock({
  event,
  calendars,
  top,
  height,
  left,
  width,
  onClick,
  onDragStart,
  isDragging,
}: TimedEventBlockProps) {
  const color = getEventColor(event, calendars);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onClick(event, e.currentTarget);
    },
    [event, onClick],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!onDragStart) return;
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onDragStart(event, e.clientY);
    },
    [event, onDragStart],
  );

  return (
    <button
      data-testid="calendar-event"
      className="absolute rounded px-1 py-0.5 text-left overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
      style={{
        top,
        height: Math.max(height - 2, 18),
        left,
        width,
        backgroundColor: color + "30",
        borderLeft: `3px solid ${color}`,
        color: color,
        zIndex: isDragging ? 20 : 1,
        opacity: isDragging ? 0.85 : undefined,
        boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : undefined,
        transition: isDragging ? "none" : "opacity 0.15s",
        touchAction: "none",
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      title={event.title}
    >
      <div className="text-[11px] font-medium truncate">{event.title}</div>
      {height > 40 && (
        <div className="text-[10px] opacity-75 truncate">
          {format(parseISO(event.start), "h:mm a")}
        </div>
      )}
      {height > 60 && event.location && (
        <div className="text-[10px] opacity-60 truncate">{event.location}</div>
      )}
    </button>
  );
});

interface AllDayChipProps {
  event: CalendarEvent;
  calendars: Calendar[];
  onClick: (event: CalendarEvent, anchor: HTMLElement) => void;
}

const AllDayChip = React.memo(function AllDayChip({
  event,
  calendars,
  onClick,
}: AllDayChipProps) {
  const color = getEventColor(event, calendars);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onClick(event, e.currentTarget);
    },
    [event, onClick],
  );

  return (
    <button
      className="text-[10px] px-1 py-px rounded truncate text-left w-full hover:opacity-80"
      style={{
        backgroundColor: color + "20",
        color: color,
      }}
      onClick={handleClick}
    >
      {event.title}
    </button>
  );
});

function CurrentTimeIndicator({ days }: { days: Date[] }) {
  const now = new Date();
  const todayIdx = days.findIndex((d) => isToday(d));
  if (todayIdx === -1) return null;

  const minutesSinceStart =
    (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  if (minutesSinceStart < 0 || minutesSinceStart > TOTAL_HOURS * 60)
    return null;

  const top = (minutesSinceStart / 60) * HOUR_HEIGHT;
  const left = 64 + (todayIdx / days.length) * (100 - 0); // approximate

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
        style={{
          backgroundColor: "#ef4444",
          left: `calc(${(todayIdx / days.length) * 100}% - 4px)`,
        }}
      />
    </div>
  );
}
