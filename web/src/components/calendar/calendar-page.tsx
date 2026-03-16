/** Calendar page with toolbar, view switcher, and calendar views */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { MonthView } from "./month-view.tsx";
import { WeekView } from "./week-view.tsx";
import { DayView } from "./day-view.tsx";
import { EventForm } from "./event-form.tsx";
import { EventPopover } from "./event-popover.tsx";
import {
  useCalendars,
  useCalendarEvents,
  useCalendarEventMutations,
  useCalendarNavigation,
} from "@/hooks/use-calendar.ts";
import type {
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  CalendarViewMode,
} from "@/types/calendar.ts";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

export const CalendarPage = React.memo(function CalendarPage() {
  const { t } = useTranslation();
  const {
    viewMode,
    setViewMode,
    currentDate,
    goToToday,
    goNext,
    goPrev,
    goToDate,
    dateRange,
    title,
  } = useCalendarNavigation("month");

  const { calendars, updateCalendar, deleteCalendar } = useCalendars();

  // Track visible calendars
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(
    () => {
      try {
        const stored = localStorage.getItem("hiddenCalendars");
        if (stored) return new Set(JSON.parse(stored));
      } catch {
        // ignore
      }
      return new Set();
    },
  );

  const visibleCalendarIds = useMemo(
    () => calendars.filter((c) => !hiddenCalendarIds.has(c.id)).map((c) => c.id),
    [calendars, hiddenCalendarIds],
  );

  const { events } = useCalendarEvents(visibleCalendarIds, dateRange);
  const { createEvent, updateEvent, deleteEvent } =
    useCalendarEventMutations();

  // Event form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultFormDate, setDefaultFormDate] = useState<Date | undefined>();
  const [defaultFormHour, setDefaultFormHour] = useState<number | undefined>();

  // Event popover state
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  const toggleCalendarVisibility = useCallback((calId: string) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calId)) {
        next.delete(calId);
      } else {
        next.add(calId);
      }
      try {
        localStorage.setItem("hiddenCalendars", JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Create new event
  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setDefaultFormDate(currentDate);
    setDefaultFormHour(undefined);
    setFormOpen(true);
  }, [currentDate]);

  // Click on a day in month view — open create event dialog pre-filled with that date
  const handleClickDay = useCallback(
    (date: Date) => {
      setEditingEvent(null);
      setDefaultFormDate(date);
      setDefaultFormHour(9);
      setFormOpen(true);
    },
    [],
  );

  // Double-click day to create event
  const handleDayDoubleClick = useCallback((date: Date) => {
    setEditingEvent(null);
    setDefaultFormDate(date);
    setDefaultFormHour(9);
    setFormOpen(true);
  }, []);

  // Click empty time slot
  const handleClickSlot = useCallback((date: Date, hour: number) => {
    setEditingEvent(null);
    setDefaultFormDate(date);
    setDefaultFormHour(hour);
    setFormOpen(true);
  }, []);

  // Click an event to show popover
  const handleClickEvent = useCallback(
    (event: CalendarEvent, anchor: HTMLElement) => {
      setPopoverEvent(event);
      setPopoverAnchor(anchor);
    },
    [],
  );

  const handleClosePopover = useCallback(() => {
    setPopoverEvent(null);
    setPopoverAnchor(null);
  }, []);

  // Edit from popover
  const handleEditEvent = useCallback((event: CalendarEvent) => {
    setPopoverEvent(null);
    setPopoverAnchor(null);
    setEditingEvent(event);
    setFormOpen(true);
  }, []);

  // Save (create or update)
  const handleSave = useCallback(
    (data: CalendarEventCreate | CalendarEventUpdate, eventId?: string) => {
      if (eventId) {
        updateEvent(eventId, data);
      } else {
        createEvent(data as CalendarEventCreate);
      }
    },
    [createEvent, updateEvent],
  );

  // Delete
  const handleDelete = useCallback(
    (eventId: string) => {
      deleteEvent(eventId);
      handleClosePopover();
    },
    [deleteEvent, handleClosePopover],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focused on input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "m":
        case "M":
          setViewMode("month");
          break;
        case "w":
        case "W":
          setViewMode("week");
          break;
        case "d":
        case "D":
          setViewMode("day");
          break;
        case "t":
        case "T":
          goToToday();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "Enter":
          handleNewEvent();
          break;
        case "Escape":
          handleClosePopover();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setViewMode, goToToday, goPrev, goNext, handleNewEvent, handleClosePopover]);

  const viewButtons: Array<{ mode: CalendarViewMode; label: string }> = [
    { mode: "month", label: t("calendar.month") },
    { mode: "week", label: t("calendar.week") },
    { mode: "day", label: t("calendar.day") },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Calendar sidebar - calendar list */}
      <div
        className="w-48 shrink-0 flex flex-col overflow-y-auto"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderRight: "1px solid var(--color-border-primary)",
        }}
      >
        <div
          className="flex items-center gap-1 px-3 py-2"
          style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
        >
          <button
            onClick={handleNewEvent}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{ color: "var(--color-text-accent)" }}
          >
            <Plus size={14} />
            {t("calendar.newEvent")}
          </button>
        </div>

        <div className="flex flex-col gap-0.5 p-2">
          <div
            className="text-[10px] font-medium uppercase tracking-wide px-2 py-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {t("calendar.calendars")}
          </div>
          {calendars.map((cal) => (
            <CalendarSidebarItem
              key={cal.id}
              calendar={cal}
              hidden={hiddenCalendarIds.has(cal.id)}
              onToggleVisibility={() => toggleCalendarVisibility(cal.id)}
              onRename={(name) => updateCalendar(cal.id, { name })}
              onDelete={() => deleteCalendar(cal.id)}
            />
          ))}
        </div>
      </div>

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 py-2 shrink-0"
          style={{
            borderBottom: "1px solid var(--color-border-primary)",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          {/* Navigation */}
          <button
            onClick={goPrev}
            className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            title={t("calendar.previous")}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            title={t("calendar.next")}
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-secondary)",
            }}
          >
            {t("calendar.today")}
          </button>

          {/* Title */}
          <h2
            className="text-sm font-semibold flex-1"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h2>

          {/* View switcher */}
          <div
            className="flex rounded-md overflow-hidden"
            style={{ border: "1px solid var(--color-border-secondary)" }}
          >
            {viewButtons.map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    viewMode === mode
                      ? "var(--color-bg-tertiary)"
                      : "transparent",
                  color:
                    viewMode === mode
                      ? "var(--color-text-accent)"
                      : "var(--color-text-secondary)",
                  borderLeft:
                    mode !== "month"
                      ? "1px solid var(--color-border-secondary)"
                      : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* View */}
        <div className="flex-1 overflow-hidden">
          {viewMode === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onClickDay={handleClickDay}
              onClickEvent={handleClickEvent}
              onDayDoubleClick={handleDayDoubleClick}
            />
          )}
          {viewMode === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onClickSlot={handleClickSlot}
              onClickEvent={handleClickEvent}
            />
          )}
          {viewMode === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onClickSlot={handleClickSlot}
              onClickEvent={handleClickEvent}
            />
          )}
        </div>
      </div>

      {/* Event detail popover */}
      <EventPopover
        event={popoverEvent}
        anchor={popoverAnchor}
        calendars={calendars}
        onClose={handleClosePopover}
        onEdit={handleEditEvent}
        onDelete={handleDelete}
      />

      {/* Event form dialog */}
      <EventForm
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editingEvent}
        calendars={calendars}
        defaultDate={defaultFormDate}
        defaultHour={defaultFormHour}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
});

/** Individual calendar item in sidebar with context menu and inline rename */
function CalendarSidebarItem({
  calendar,
  hidden,
  onToggleVisibility,
  onRename,
  onDelete,
}: {
  calendar: { id: string; name: string; color?: string; isDefault?: boolean };
  hidden: boolean;
  onToggleVisibility: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(calendar.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const color = calendar.color ?? "#3b82f6";

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== calendar.name) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, calendar.name, onRename]);

  if (isRenaming) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs">
        <div
          className="w-3 h-3 rounded-sm shrink-0"
          style={{
            backgroundColor: color,
            border: `1.5px solid ${color}`,
          }}
        />
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") setIsRenaming(false);
          }}
          onBlur={handleRenameSubmit}
          className="flex-1 h-5 px-1 text-xs outline-none"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-focus)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.08)",
          }}
        />
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-[var(--color-bg-tertiary)] transition-colors"
          style={{
            color: hidden
              ? "var(--color-text-tertiary)"
              : "var(--color-text-primary)",
            opacity: hidden ? 0.5 : 1,
          }}
          onClick={onToggleVisibility}
        >
          <div
            className="w-3 h-3 rounded-sm shrink-0 flex items-center justify-center"
            style={{
              backgroundColor: hidden ? "transparent" : color,
              border: `1.5px solid ${color}`,
            }}
          >
            {!hidden && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path
                  d="M1.5 4L3 5.5L6.5 2"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <span className="truncate">{calendar.name}</span>
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[140px] p-1 text-sm animate-scale-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-md)",
            zIndex: 50,
          }}
        >
          <ContextMenu.Item
            className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            style={{
              color: "var(--color-text-primary)",
              borderRadius: "var(--radius-sm)",
            }}
            onSelect={() => {
              setRenameValue(calendar.name);
              setIsRenaming(true);
            }}
          >
            {t("calendar.rename")}
          </ContextMenu.Item>
          {!calendar.isDefault && (
            <>
              <ContextMenu.Separator
                className="my-1"
                style={{ borderTop: "1px solid var(--color-border-primary)" }}
              />
              <ContextMenu.Item
                className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{
                  color: "var(--color-text-danger)",
                  borderRadius: "var(--radius-sm)",
                }}
                onSelect={onDelete}
              >
                {t("calendar.deleteCalendar")}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
