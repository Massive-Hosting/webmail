/** Calendar hooks with TanStack Query */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCalendars,
  createCalendar as apiCreateCalendar,
  updateCalendar as apiUpdateCalendar,
  deleteCalendar as apiDeleteCalendar,
  fetchCalendarEvents,
  createCalendarEvent as apiCreateCalendarEvent,
  updateCalendarEvent as apiUpdateCalendarEvent,
  deleteCalendarEvent as apiDeleteCalendarEvent,
} from "@/api/calendar.ts";
import type {
  Calendar,
  CalendarCreate,
  CalendarEvent,
  CalendarEventCreate,
  CalendarEventUpdate,
  CalendarViewMode,
  DateRange,
} from "@/types/calendar.ts";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addMonths,
  addWeeks,
  addDays,
  subMonths,
  subWeeks,
  subDays,
  format,
  parseISO,
  addMinutes,
  addHours,
  differenceInMinutes,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";

// ---- Calendar list ----

export function useCalendars() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["calendars"],
    queryFn: fetchCalendars,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: CalendarCreate) => apiCreateCalendar(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      toast.success("Calendar created");
    },
    onError: (err: Error) => {
      toast.error(`Failed to create calendar: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: {
      id: string;
      updates: Partial<CalendarCreate>;
    }) => apiUpdateCalendar(params.id, params.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
    },
    onError: () => {
      toast.error("Failed to update calendar");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiDeleteCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
      toast.success("Calendar deleted");
    },
    onError: () => {
      toast.error("Failed to delete calendar");
    },
  });

  return {
    calendars: query.data ?? [],
    isLoading: query.isLoading,
    createCalendar: useCallback(
      (data: CalendarCreate) => createMutation.mutateAsync(data),
      [createMutation],
    ),
    updateCalendar: useCallback(
      (id: string, updates: Partial<CalendarCreate>) =>
        updateMutation.mutate({ id, updates }),
      [updateMutation],
    ),
    deleteCalendar: useCallback(
      (id: string) => deleteMutation.mutate(id),
      [deleteMutation],
    ),
  };
}

// ---- Calendar navigation ----

export function useCalendarNavigation(initialView: CalendarViewMode = "week") {
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goNext = useCallback(() => {
    setCurrentDate((d) => {
      switch (viewMode) {
        case "month":
          return addMonths(d, 1);
        case "week":
        case "team":
          return addWeeks(d, 1);
        case "day":
          return addDays(d, 1);
      }
    });
  }, [viewMode]);

  const goPrev = useCallback(() => {
    setCurrentDate((d) => {
      switch (viewMode) {
        case "month":
          return subMonths(d, 1);
        case "week":
        case "team":
          return subWeeks(d, 1);
        case "day":
          return subDays(d, 1);
      }
    });
  }, [viewMode]);

  const goToDate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  /** The date range visible in the current view (expanded for month to include surrounding weeks) */
  const dateRange: DateRange = useMemo(() => {
    switch (viewMode) {
      case "month": {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const viewStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const viewEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return {
          start: viewStart.toISOString(),
          end: viewEnd.toISOString(),
        };
      }
      case "week": {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          start: weekStart.toISOString(),
          end: weekEnd.toISOString(),
        };
      }
      case "day":
        return {
          start: startOfDay(currentDate).toISOString(),
          end: endOfDay(currentDate).toISOString(),
        };
      case "team": {
        const teamWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const teamWeekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          start: teamWeekStart.toISOString(),
          end: teamWeekEnd.toISOString(),
        };
      }
    }
  }, [viewMode, currentDate]);

  /** Formatted title for the current view */
  const title = useMemo(() => {
    switch (viewMode) {
      case "month":
        return format(currentDate, "MMMM yyyy");
      case "week": {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        if (weekStart.getMonth() === weekEnd.getMonth()) {
          return `${format(weekStart, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
        }
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
      }
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "team": {
        const teamStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const teamEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `Team: ${format(teamStart, "MMM d")} - ${format(teamEnd, "MMM d, yyyy")}`;
      }
    }
  }, [viewMode, currentDate]);

  return {
    viewMode,
    setViewMode,
    currentDate,
    setCurrentDate,
    goToToday,
    goNext,
    goPrev,
    goToDate,
    dateRange,
    title,
  };
}

// ---- Calendar events ----

export function useCalendarEvents(
  calendarIds: string[],
  dateRange: DateRange,
) {
  const query = useQuery({
    queryKey: ["calendarEvents", calendarIds, dateRange],
    queryFn: () => fetchCalendarEvents(calendarIds, dateRange),
    // Only fetch when we have calendar IDs — avoids a wasted request
    // when calendars haven't loaded yet (e.g. agenda sidebar on initial load).
    enabled: calendarIds.length > 0,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ---- Event mutations ----

export function useCalendarEventMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: apiCreateCalendarEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
      toast.success("Event created");
    },
    onError: (err: Error) => {
      toast.error(`Failed to create event: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; updates: CalendarEventUpdate }) =>
      apiUpdateCalendarEvent(params.id, params.updates),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["calendarEvents"] });
      const queries = queryClient.getQueriesData<CalendarEvent[]>({
        queryKey: ["calendarEvents"],
      });
      // Optimistic update across all cached event queries
      for (const [key, data] of queries) {
        if (data) {
          queryClient.setQueryData<CalendarEvent[]>(
            key,
            data.map((e) =>
              e.id === params.id
                ? ({ ...e, ...params.updates } as CalendarEvent)
                : e,
            ),
          );
        }
      }
      return { queries };
    },
    onError: (_err, _params, context) => {
      // Rollback
      if (context?.queries) {
        for (const [key, data] of context.queries) {
          if (data) {
            queryClient.setQueryData(key, data);
          }
        }
      }
      toast.error("Failed to update event");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiDeleteCalendarEvent,
    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: ["calendarEvents"] });
      const queries = queryClient.getQueriesData<CalendarEvent[]>({
        queryKey: ["calendarEvents"],
      });
      for (const [key, data] of queries) {
        if (data) {
          queryClient.setQueryData<CalendarEvent[]>(
            key,
            data.filter((e) => e.id !== eventId),
          );
        }
      }
      return { queries };
    },
    onError: (_err, _params, context) => {
      if (context?.queries) {
        for (const [key, data] of context.queries) {
          if (data) {
            queryClient.setQueryData(key, data);
          }
        }
      }
      toast.error("Failed to delete event");
    },
    onSuccess: () => {
      toast.success("Event deleted");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] });
    },
  });

  return {
    createEvent: useCallback(
      (event: CalendarEventCreate) => createMutation.mutateAsync(event),
      [createMutation],
    ),
    updateEvent: useCallback(
      (id: string, updates: CalendarEventUpdate) =>
        updateMutation.mutate({ id, updates }),
      [updateMutation],
    ),
    deleteEvent: useCallback(
      (id: string) => deleteMutation.mutate(id),
      [deleteMutation],
    ),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ---- Helpers ----

/** Parse ISO 8601 duration to minutes */
export function parseDurationMinutes(duration?: string): number {
  if (!duration) return 60; // default 1 hour
  let total = 0;
  const timeMatch = duration.match(
    /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/,
  );
  if (timeMatch) {
    const days = parseInt(timeMatch[1] ?? "0", 10);
    const hours = parseInt(timeMatch[2] ?? "0", 10);
    const minutes = parseInt(timeMatch[3] ?? "0", 10);
    total = days * 24 * 60 + hours * 60 + minutes;
  }
  return total || 60;
}

/** Convert minutes to ISO 8601 duration */
export function minutesToDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `PT${hours}H${mins}M`;
  if (hours > 0) return `PT${hours}H`;
  return `PT${mins}M`;
}

/** Get end Date from event start + duration */
export function getEventEnd(event: CalendarEvent): Date {
  const start = parseISO(event.start);
  const durationMins = parseDurationMinutes(event.duration);
  return addMinutes(start, durationMins);
}

/** Get event color, falling back to calendar color */
export function getEventColor(
  event: CalendarEvent,
  calendars: Calendar[],
): string {
  if (event.color) return event.color;
  const calendarId = Object.keys(event.calendarIds)[0];
  const calendar = calendars.find((c) => c.id === calendarId);
  return calendar?.color ?? "#3b82f6";
}

/** Format event time range for display */
export function formatEventTime(event: CalendarEvent): string {
  if (event.showWithoutTime) return "All day";
  const start = parseISO(event.start);
  const end = getEventEnd(event);
  return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
}

/** Check if event falls on a specific day */
export function isEventOnDay(event: CalendarEvent, day: Date): boolean {
  const eventStart = parseISO(event.start);
  const eventEnd = getEventEnd(event);
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return eventStart <= dayEnd && eventEnd >= dayStart;
}

export { format, parseISO, addMinutes, addHours, differenceInMinutes, isSameDay, isSameMonth, isToday, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays };
