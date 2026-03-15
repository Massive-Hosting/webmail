/** Date, size, and address formatting utilities */

import {
  format,
  isToday,
  isThisYear,
  formatDistanceToNow,
} from "date-fns";
import type { TFunction } from "i18next";
import type { EmailAddress } from "@/types/mail.ts";

/** Smart date formatting: "2:30 PM" today, "Mar 12" this year, "Mar 12, 2025" older */
export function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, "h:mm a");
  }
  if (isThisYear(date)) {
    return format(date, "MMM d");
  }
  return format(date, "MMM d, yyyy");
}

/** Full date + time for tooltips */
export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "EEEE, MMMM d, yyyy 'at' h:mm a");
}

/** Relative date for tooltips */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Format file size: "1.2 KB", "3.4 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format email address for display */
export function formatAddress(addr: EmailAddress): string {
  if (addr.name) return addr.name;
  return addr.email;
}

/** Format list of addresses */
export function formatAddressList(addrs: EmailAddress[] | null): string {
  if (!addrs || addrs.length === 0) return "";
  return addrs.map(formatAddress).join(", ");
}

/** Get initials from name or email for avatar */
export function getInitials(addr: EmailAddress): string {
  if (addr.name) {
    const parts = addr.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  return addr.email[0].toUpperCase();
}

/** Date group identifiers for message list grouping */
export type DateGroup =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | string; // older months like "February 2026"

/** Determine which date group a message belongs to */
export function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  // Monday-based week start
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - mondayOffset);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  if (date >= today) return "today";
  if (date >= yesterday) return "yesterday";
  if (date >= thisWeekStart) return "thisWeek";
  if (date >= lastWeekStart) return "lastWeek";
  if (date >= thisMonthStart) return "thisMonth";
  if (date >= lastMonthStart) return "lastMonth";
  // For older: return month name + year as a stable key
  return `older:${date.getFullYear()}-${date.getMonth()}`;
}

/** Well-known group keys (used to distinguish from older-month keys) */
const KNOWN_GROUPS = new Set([
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
]);

/** Convert a date group key into a user-visible label */
export function getDateGroupLabel(group: DateGroup, t: TFunction, locale?: string): string {
  if (KNOWN_GROUPS.has(group)) {
    return t(`dateGroup.${group}`);
  }
  // older:YYYY-M  →  locale-aware month name + year
  const parts = group.replace("older:", "").split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const d = new Date(year, month, 1);
  return d.toLocaleDateString(locale ?? "en", { month: "long", year: "numeric" });
}

/** Generate a consistent color for an avatar based on email */
export function getAvatarColor(email: string): string {
  const colors = [
    "#2563eb", "#7c3aed", "#0891b2", "#059669",
    "#d97706", "#dc2626", "#db2777", "#0d9488",
    "#9333ea", "#ea580c", "#1d4ed8", "#0369a1",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}
