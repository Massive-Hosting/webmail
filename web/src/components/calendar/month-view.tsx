/** Month view: 6-week grid with events */

import React, { useMemo, useCallback } from "react";
import { Video } from "lucide-react";
import type { CalendarEvent, Calendar } from "@/types/calendar.ts";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
  format,
  parseISO,
  getEventColor,
  isEventOnDay,
} from "@/hooks/use-calendar.ts";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onClickDay: (date: Date) => void;
  onClickEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
  onDayDoubleClick: (date: Date) => void;
}

const MAX_EVENTS_PER_DAY = 3;

export const MonthView = React.memo(function MonthView({
  currentDate,
  events,
  calendars,
  onClickDay,
  onClickEvent,
  onDayDoubleClick,
}: MonthViewProps) {
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const viewStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const viewEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const result: Date[][] = [];
    let day = viewStart;
    while (day <= viewEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      result.push(week);
    }
    return result;
  }, [currentDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const week of weeks) {
      for (const day of week) {
        const key = format(day, "yyyy-MM-dd");
        const dayEvents = events
          .filter((e) => isEventOnDay(e, day))
          .sort((a, b) => {
            // All-day first, then by start time
            if (a.showWithoutTime && !b.showWithoutTime) return -1;
            if (!a.showWithoutTime && b.showWithoutTime) return 1;
            return a.start.localeCompare(b.start);
          });
        if (dayEvents.length > 0) {
          map.set(key, dayEvents);
        }
      }
    }
    return map;
  }, [weeks, events]);

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 shrink-0">
        {dayNames.map((name) => (
          <div
            key={name}
            className="px-2 py-1.5 text-xs font-medium text-center"
            style={{
              color: "var(--color-text-tertiary)",
              borderBottom: "1px solid var(--color-border-secondary)",
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="grid flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7" style={{ borderBottom: wi < weeks.length - 1 ? "1px solid var(--color-border-secondary)" : undefined }}>
            {week.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_DAY);
              const moreCount = dayEvents.length - MAX_EVENTS_PER_DAY;

              return (
                <DayCell
                  key={key}
                  day={day}
                  inMonth={inMonth}
                  today={today}
                  events={visibleEvents}
                  moreCount={moreCount > 0 ? moreCount : 0}
                  calendars={calendars}
                  onClick={() => onClickDay(day)}
                  onDoubleClick={() => onDayDoubleClick(day)}
                  onClickEvent={onClickEvent}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

interface DayCellProps {
  day: Date;
  inMonth: boolean;
  today: boolean;
  events: CalendarEvent[];
  moreCount: number;
  calendars: Calendar[];
  onClick: () => void;
  onDoubleClick: () => void;
  onClickEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
}

const DayCell = React.memo(function DayCell({
  day,
  inMonth,
  today,
  events,
  moreCount,
  calendars,
  onClick,
  onDoubleClick,
  onClickEvent,
}: DayCellProps) {
  return (
    <div
      className="flex flex-col p-1 min-h-0 overflow-hidden cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
      style={{
        borderRight: "1px solid var(--color-border-secondary)",
        backgroundColor: today ? "var(--color-bg-tertiary)" : undefined,
        opacity: inMonth ? 1 : 0.4,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-center justify-center mb-0.5">
        <span
          className="text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full"
          style={{
            backgroundColor: today ? "var(--color-text-accent)" : undefined,
            color: today
              ? "#ffffff"
              : inMonth
                ? "var(--color-text-primary)"
                : "var(--color-text-tertiary)",
          }}
        >
          {format(day, "d")}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 min-h-0 overflow-hidden">
        {events.map((event) => (
          <EventChip
            key={event.id}
            event={event}
            calendars={calendars}
            onClick={onClickEvent}
          />
        ))}
        {moreCount > 0 && (
          <span
            className="text-[10px] px-1 truncate"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            +{moreCount} more
          </span>
        )}
      </div>
    </div>
  );
});

interface EventChipProps {
  event: CalendarEvent;
  calendars: Calendar[];
  onClick: (event: CalendarEvent, anchor: HTMLElement) => void;
}

const EventChip = React.memo(function EventChip({
  event,
  calendars,
  onClick,
}: EventChipProps) {
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
      className="flex items-center gap-1 px-1 py-px rounded text-[11px] truncate text-left w-full hover:opacity-80 transition-opacity"
      style={{
        backgroundColor: color + "20",
        color: color,
        borderLeft: `2px solid ${color}`,
      }}
      onClick={handleClick}
      title={event.title}
    >
      {event.description?.includes("[wave-meeting]") && (
        <Video size={10} className="shrink-0" style={{ color: "#6366f1" }} />
      )}
      {!event.showWithoutTime && (
        <span className="shrink-0 text-[10px] opacity-75">
          {format(parseISO(event.start), "h:mm")}
        </span>
      )}
      <span className="truncate">{event.title}</span>
    </button>
  );
});
