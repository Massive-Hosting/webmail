/** Calendar page with toolbar, view switcher, and calendar views */

import React, { useState, useCallback, useEffect, useMemo, useRef, startTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ResizeHandle } from "@/components/layout/resize-handle.tsx";
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
  Calendar,
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  CalendarViewMode,
} from "@/types/calendar.ts";
import { importICS } from "./ics-import.ts";
import { ShareCalendarDialog } from "./share-calendar-dialog.tsx";
import { TeamAvailability } from "./team-availability.tsx";
import { sendInvitationEmails } from "@/api/calendar.ts";
import { saveEventParticipants, deleteEventParticipants, type EventParticipant } from "@/api/participants.ts";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store.ts";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

export const CalendarPage = React.memo(function CalendarPage() {
  const { t } = useTranslation();
  const {
    viewMode,
    setViewMode,
    currentDate,
    goToToday,
    goNext,
    goPrev,
    dateRange,
    title,
  } = useCalendarNavigation("week");

  const queryClient = useQueryClient();
  const { calendars, createCalendar, updateCalendar, deleteCalendar } = useCalendars();

  // Track which calendar ID is newly created (should enter rename mode)
  const [newCalendarId, setNewCalendarId] = useState<string | null>(null);

  // Share calendar dialog state
  const [shareCalendar, setShareCalendar] = useState<Calendar | null>(null);

  // Sidebar width (resizable, persisted)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem("webmail:calendarSidebarWidth");
      if (stored) return Math.max(150, Math.min(350, Number(stored)));
    } catch {
      // ignore
    }
    return 220;
  });

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => {
      const next = Math.max(150, Math.min(350, prev + delta));
      try {
        localStorage.setItem("webmail:calendarSidebarWidth", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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
  const userEmail = useAuthStore((s) => s.email);

  // Event form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultFormDate, setDefaultFormDate] = useState<Date | undefined>();
  const [defaultFormHour, setDefaultFormHour] = useState<number | undefined>();
  const [defaultAttendees, setDefaultAttendees] = useState<string[] | undefined>();

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

  // Create new calendar
  const handleAddCalendar = useCallback(async () => {
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
    const usedColors = new Set(calendars.map((c) => c.color));
    const nextColor = colors.find((c) => !usedColors.has(c)) ?? colors[Math.floor(Math.random() * colors.length)];
    try {
      const id = await createCalendar({ name: t("calendar.newCalendar"), color: nextColor });
      if (id) setNewCalendarId(id);
    } catch {
      // error toast handled by hook
    }
  }, [calendars, createCalendar, t]);

  // Create new event
  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setDefaultFormDate(currentDate);
    setDefaultFormHour(undefined);
    setFormOpen(true);
  }, [currentDate]);

  // Import .ics file
  const handleImportICS = useCallback(async () => {
    const defaultCalendar = calendars.find((c) => c.isDefault) ?? calendars[0];
    if (!defaultCalendar) return;
    const count = await importICS(defaultCalendar.id);
    if (count > 0) {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
    }
  }, [calendars, queryClient]);

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

  // Save (create or update) — persists participants and sends invitation emails
  const handleSave = useCallback(
    async (data: CalendarEventCreate | CalendarEventUpdate, eventId?: string) => {
      const participants = "participants" in data ? data.participants : undefined;
      const attendees: EventParticipant[] = participants
        ? Object.values(participants)
            .filter((p) => p.roles?.attendee && p.email)
            .map((p) => ({
              eventId: eventId ?? "",
              email: p.email!,
              name: p.name ?? "",
              role: "attendee",
              status: p.participationStatus ?? "needs-action",
            }))
        : [];

      let savedEventId = eventId;
      if (eventId) {
        updateEvent(eventId, data);
      } else {
        try {
          savedEventId = await createEvent(data as CalendarEventCreate);
        } catch {
          return;
        }
      }

      // Persist participants to webmail DB (Stalwart doesn't return them)
      if (savedEventId && attendees.length > 0) {
        const withId = attendees.map((a) => ({ ...a, eventId: savedEventId! }));
        saveEventParticipants(savedEventId, withId).catch(() => {});
      } else if (savedEventId && attendees.length === 0) {
        deleteEventParticipants(savedEventId).catch(() => {});
      }

      // Send invitation emails if there are attendees (fire-and-forget)
      if (attendees.length > 0) {
        sendInvitationEmails(data as CalendarEventCreate, "REQUEST").catch((err) => {
          toast.error(`Failed to send invitations: ${err instanceof Error ? err.message : "Unknown error"}`);
        });
      }
    },
    [createEvent, updateEvent, userEmail],
  );

  // Drag-and-drop: change event time
  const handleEventTimeChange = useCallback(
    (event: CalendarEvent, newStart: string) => {
      updateEvent(event.id, { start: newStart });
    },
    [updateEvent],
  );

  // Delete — sends cancellation emails to attendees and cleans up participants
  const handleDelete = useCallback(
    (eventId: string) => {
      const event = events.find((e) => e.id === eventId);
      deleteEvent(eventId);
      handleClosePopover();
      // Clean up participants from webmail DB
      deleteEventParticipants(eventId).catch(() => {});
      // Send cancellation if event had attendees (fire-and-forget)
      if (event?.participants && Object.values(event.participants).some((p) => p.roles?.attendee)) {
        sendInvitationEmails(event, "CANCEL").catch(() => {});
      }
    },
    [deleteEvent, handleClosePopover, events],
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
    { mode: "team", label: t("calendar.team") },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Calendar sidebar - calendar list */}
      <div
        className="shrink-0 flex flex-col overflow-y-auto overflow-x-hidden bg-secondary"
        style={{
          width: sidebarWidth,
          borderRight: "1px solid var(--color-border-primary)",
        }}
      >
        <div
          className="flex items-center gap-1 px-3 py-2 border-b-secondary"
        >
          <button
            onClick={handleNewEvent}
            className="action-bar__btn action-bar__btn--primary"
          >
            <Plus size={16} />
            <span className="action-bar__btn-label">{t("calendar.newEvent")}</span>
          </button>
          <Tooltip.Provider delayDuration={400}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={handleImportICS}
                  className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors text-tertiary"
                >
                  <Upload size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content className="tooltip-content" sideOffset={5}>
                {t("calendar.importICS")}
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        <div className="flex flex-col gap-0.5 p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <div
              className="text-[10px] font-medium uppercase tracking-wide text-tertiary"
            >
              {t("calendar.calendars")}
            </div>
            <button
              onClick={handleAddCalendar}
              className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-tertiary"
              title={t("calendar.addCalendar")}
            >
              <Plus size={12} />
            </button>
          </div>
          {calendars.map((cal) => (
            <CalendarSidebarItem
              key={cal.id}
              calendar={cal}
              hidden={hiddenCalendarIds.has(cal.id)}
              onToggleVisibility={() => toggleCalendarVisibility(cal.id)}
              onRename={(name) => updateCalendar(cal.id, { name })}
              onChangeColor={(color) => updateCalendar(cal.id, { color })}
              onDelete={() => deleteCalendar(cal.id)}
              onShare={() => setShareCalendar(cal)}
              autoRename={cal.id === newCalendarId}
              onAutoRenameDone={() => setNewCalendarId(null)}
            />
          ))}
        </div>
      </div>

      <ResizeHandle
        onResize={handleSidebarResize}
        onDoubleClick={() => {
          setSidebarWidth(220);
          try { localStorage.setItem("webmail:calendarSidebarWidth", "220"); } catch { /* ignore */ }
        }}
      />

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 py-2 shrink-0 border-b-primary bg-primary"
        >
          {/* Navigation */}
          <button
            onClick={goPrev}
            className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-secondary"
            title={t("calendar.previous")}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-secondary"
            title={t("calendar.next")}
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors text-secondary border-secondary"
          >
            {t("calendar.today")}
          </button>

          {/* Title */}
          <h2
            className="text-sm font-semibold flex-1 text-primary"
          >
            {title}
          </h2>

          {/* View switcher */}
          <div
            className="flex rounded-md overflow-hidden border-secondary"
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
              onEventTimeChange={handleEventTimeChange}
            />
          )}
          {viewMode === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onClickSlot={handleClickSlot}
              onClickEvent={handleClickEvent}
              onEventTimeChange={handleEventTimeChange}
            />
          )}
          {viewMode === "team" && (
            <TeamAvailability
              currentDate={currentDate}
              onCreateEvent={(date, hour, attendees) => {
                setDefaultFormDate(date);
                setDefaultFormHour(hour);
                setDefaultAttendees(attendees);
                setEditingEvent(null);
                setFormOpen(true);
              }}
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
        dayEvents={events}
        defaultDate={defaultFormDate}
        defaultHour={defaultFormHour}
        defaultAttendees={defaultAttendees}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* Share calendar dialog */}
      {shareCalendar && (
        <ShareCalendarDialog
          open={!!shareCalendar}
          onOpenChange={(open) => { if (!open) setShareCalendar(null); }}
          calendar={shareCalendar}
        />
      )}
    </div>
  );
});

const CALENDAR_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#a855f7",
];

/** Individual calendar item in sidebar with context menu and inline rename */
function CalendarSidebarItem({
  calendar,
  hidden,
  onToggleVisibility,
  onRename,
  onChangeColor,
  onDelete,
  onShare,
  autoRename,
  onAutoRenameDone,
}: {
  calendar: Calendar;
  hidden: boolean;
  onToggleVisibility: () => void;
  onRename: (name: string) => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
  onShare: () => void;
  autoRename?: boolean;
  onAutoRenameDone?: () => void;
}) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(calendar.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const color = calendar.color ?? "#3b82f6";

  // Auto-enter rename mode for newly created calendars
  useEffect(() => {
    if (autoRename) {
      startTransition(() => {
        setRenameValue(calendar.name);
        setIsRenaming(true);
      });
      onAutoRenameDone?.();
    }
  }, [autoRename, calendar.name, onAutoRenameDone]);

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
      <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs overflow-hidden">
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
          className="flex-1 min-w-0 h-5 px-1 text-xs outline-none bg-tertiary text-primary"
          style={{
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
          {calendar.shareWith && Object.keys(calendar.shareWith).length > 0 && (
            <span title={t("calendar.shared")}>
              <Users
                size={10}
                className="shrink-0 ml-auto text-tertiary"
              />
            </span>
          )}
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[140px] p-1 text-sm animate-scale-in bg-elevated border-primary"
          style={{
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-md)",
            zIndex: 50,
          }}
        >
          <ContextMenu.Item
            className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 text-primary"
            style={{ borderRadius: "var(--radius-sm)" }}
            onSelect={() => {
              setRenameValue(calendar.name);
              setIsRenaming(true);
            }}
          >
            {t("calendar.rename")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 text-primary"
            style={{ borderRadius: "var(--radius-sm)" }}
            onSelect={onShare}
          >
            <Users size={13} />
            {t("calendar.share")}
          </ContextMenu.Item>
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger
              className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 text-primary"
              style={{ borderRadius: "var(--radius-sm)" }}
            >
              <span className="flex-1">{t("calendar.color")}</span>
              <div
                className="w-3 h-3 rounded-full ml-2 shrink-0"
                style={{ backgroundColor: color }}
              />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent
                className="p-2 animate-scale-in bg-elevated border-primary"
                style={{
                  boxShadow: "var(--shadow-lg)",
                  borderRadius: "var(--radius-md)",
                  zIndex: 50,
                }}
              >
                <div className="grid grid-cols-4 gap-1.5">
                  {CALENDAR_COLORS.map((c) => (
                    <ContextMenu.Item
                      key={c}
                      className="w-6 h-6 rounded-full cursor-pointer outline-none flex items-center justify-center transition-transform hover:scale-110"
                      style={{ backgroundColor: c }}
                      onSelect={() => onChangeColor(c)}
                    >
                      {c === color && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </ContextMenu.Item>
                  ))}
                </div>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
          {!calendar.isDefault && (
            <>
              <ContextMenu.Separator
                className="my-1 border-t-primary"
              />
              <ContextMenu.Item
                className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 text-danger"
                style={{ borderRadius: "var(--radius-sm)" }}
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
