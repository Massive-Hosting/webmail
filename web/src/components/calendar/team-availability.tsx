/** Team availability grid — shows free/busy for all colleagues in a week view */

import React, { useState, useEffect, useMemo, useCallback, startTransition } from "react";
import { fetchTeamAvailability, type TeamMember } from "@/api/availability.ts";
import { Loader2, Plus } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";

interface TeamAvailabilityProps {
  currentDate: Date;
  onCreateEvent?: (date: Date, hour: number, attendees?: string[]) => void;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8am - 6pm
const SLOT_WIDTH = 48;
const ROW_HEIGHT = 36;
const NAME_WIDTH = 140;

const BUSY_COLORS = ["#ef4444", "#f97316", "#8b5cf6", "#06b6d4", "#ec4899", "#22c55e", "#3b82f6"];

export const TeamAvailability = React.memo(function TeamAvailability({
  currentDate,
  onCreateEvent,
}: TeamAvailabilityProps) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedDay, setSelectedDay] = useState(0); // 0-4 (Mon-Fri)

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Fetch team availability for the selected day
  useEffect(() => {
    startTransition(() => setLoading(true));
    const day = weekDays[selectedDay];
    const dayStart = format(day, "yyyy-MM-dd") + "T00:00:00";
    const dayEnd = format(day, "yyyy-MM-dd") + "T23:59:59";

    fetchTeamAvailability(dayStart, dayEnd)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [weekDays, selectedDay]);

  // Find free slots across all members for a given hour
  const isSlotBusy = useCallback(
    (memberIdx: number, hour: number, half: 0 | 1): boolean => {
      const member = members[memberIdx];
      if (!member) return false;
      const slotStart = hour * 60 + half * 30;
      const slotEnd = slotStart + 30;
      return member.busySlots.some((slot) => {
        const st = new Date(slot.start);
        const busyStart = st.getHours() * 60 + st.getMinutes();
        const busyEnd = busyStart + parseDurationMins(slot.duration);
        return busyStart < slotEnd && busyEnd > slotStart;
      });
    },
    [members],
  );

  // Check if all members are free at a given hour
  const isEveryoneFree = useCallback(
    (hour: number, half: 0 | 1): boolean => {
      if (members.length === 0) return false;
      return members.every((_, idx) => !isSlotBusy(idx, hour, half));
    },
    [members, isSlotBusy],
  );

  const handleSlotClick = useCallback(
    (hour: number, half: 0 | 1) => {
      if (!onCreateEvent) return;
      const day = weekDays[selectedDay];
      const eventDate = new Date(day);
      eventDate.setHours(hour, half * 30, 0, 0);
      onCreateEvent(eventDate, hour, members.map((m) => m.email));
    },
    [onCreateEvent, weekDays, selectedDay, members],
  );

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      {/* Day tabs */}
      <div
        className="flex items-center gap-1 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
      >
        {weekDays.map((day, i) => (
          <button
            key={i}
            onClick={() => setSelectedDay(i)}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={{
              backgroundColor: i === selectedDay ? "var(--color-bg-accent)" : "transparent",
              color: i === selectedDay ? "white" : "var(--color-text-secondary)",
            }}
          >
            <div>{format(day, "EEE")}</div>
            <div className="text-[10px] opacity-75">{format(day, "MMM d")}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
        </div>
      ) : members.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          No team members found. Enable the company directory in your hosting control panel.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Grid */}
          <div className="relative" style={{ minWidth: NAME_WIDTH + HOURS.length * SLOT_WIDTH * 2 }}>
            {/* Header: hours */}
            <div className="flex sticky top-0 z-10" style={{ backgroundColor: "var(--color-bg-primary)" }}>
              <div className="shrink-0" style={{ width: NAME_WIDTH }} />
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="text-[10px] text-center font-medium shrink-0"
                  style={{
                    width: SLOT_WIDTH * 2,
                    color: "var(--color-text-tertiary)",
                    borderBottom: "1px solid var(--color-border-secondary)",
                    padding: "4px 0",
                  }}
                >
                  {hour}:00
                </div>
              ))}
            </div>

            {/* "Everyone" row */}
            <div className="flex" style={{ height: ROW_HEIGHT, borderBottom: "2px solid var(--color-border-primary)" }}>
              <div
                className="shrink-0 flex items-center px-3 text-xs font-semibold"
                style={{ width: NAME_WIDTH, color: "var(--color-text-accent)" }}
              >
                Everyone
              </div>
              {HOURS.map((hour) =>
                ([0, 1] as const).map((half) => {
                  const free = isEveryoneFree(hour, half);
                  return (
                    <div
                      key={`all-${hour}-${half}`}
                      className="shrink-0 transition-colors cursor-pointer"
                      style={{
                        width: SLOT_WIDTH,
                        height: ROW_HEIGHT,
                        backgroundColor: free ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.08)",
                        borderRight: half === 1 ? "1px solid var(--color-border-secondary)" : "1px dotted var(--color-border-secondary)",
                      }}
                      onClick={() => free && handleSlotClick(hour, half)}
                      title={free ? "Everyone free — click to schedule" : "Conflict"}
                    >
                      {free && (
                        <div className="flex items-center justify-center h-full opacity-0 hover:opacity-100 transition-opacity">
                          <Plus size={12} style={{ color: "var(--color-bg-success)" }} />
                        </div>
                      )}
                    </div>
                  );
                }),
              )}
            </div>

            {/* Member rows */}
            {members.map((member, memberIdx) => (
              <div
                key={member.email}
                className="flex"
                style={{
                  height: ROW_HEIGHT,
                  borderBottom: "1px solid var(--color-border-secondary)",
                }}
              >
                <div
                  className="shrink-0 flex items-center gap-2 px-3"
                  style={{ width: NAME_WIDTH }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: BUSY_COLORS[memberIdx % BUSY_COLORS.length] }}
                  />
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--color-text-primary)" }}
                    title={member.email}
                  >
                    {member.name || member.email.split("@")[0]}
                  </span>
                </div>
                {HOURS.map((hour) =>
                  ([0, 1] as const).map((half) => {
                    const busy = isSlotBusy(memberIdx, hour, half);
                    const busyColor = BUSY_COLORS[memberIdx % BUSY_COLORS.length];
                    return (
                      <div
                        key={`${member.email}-${hour}-${half}`}
                        className="shrink-0"
                        style={{
                          width: SLOT_WIDTH,
                          height: ROW_HEIGHT,
                          backgroundColor: busy ? busyColor + "20" : "transparent",
                          borderRight: half === 1 ? "1px solid var(--color-border-secondary)" : "1px dotted var(--color-border-secondary)",
                          borderLeft: busy ? `3px solid ${busyColor}60` : undefined,
                        }}
                        title={busy ? `${member.name || member.email} — busy` : undefined}
                      />
                    );
                  }),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function parseDurationMins(duration: string): number {
  if (!duration) return 60;
  let mins = 0;
  const hourMatch = duration.match(/(\d+)H/);
  const minMatch = duration.match(/(\d+)M/);
  if (hourMatch) mins += parseInt(hourMatch[1]) * 60;
  if (minMatch) mins += parseInt(minMatch[1]);
  return mins || 60;
}
