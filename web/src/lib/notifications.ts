/**
 * Desktop notification helpers for new email alerts.
 *
 * Uses the Web Notifications API (no Service Worker required).
 * Notifications are only shown when the tab is not focused and
 * the user has granted permission + enabled them in settings.
 */

import { useSettingsStore } from "@/stores/settings-store.ts";
import type { EmailListItem } from "@/types/mail.ts";

/** Format sender display name from an email's `from` field */
function formatSender(email: EmailListItem): string {
  const addr = email.from?.[0];
  if (!addr) return "Unknown sender";
  return addr.name || addr.email;
}

/**
 * Request browser notification permission.
 * Returns true if permission is (now) granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Show a desktop notification for a newly arrived email.
 *
 * Guards:
 * - notifications.enabled must be true in the settings store
 * - Notification.permission must be "granted"
 * - The tab must NOT be focused (no point notifying about visible content)
 */
export function showEmailNotification(email: EmailListItem): void {
  const { notifications } = useSettingsStore.getState();
  if (!notifications.enabled) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  const sender = formatSender(email);
  const subject = email.subject || "(no subject)";
  const preview = email.preview?.slice(0, 100) ?? "";

  const notification = new Notification(sender, {
    body: subject + (preview ? "\n" + preview : ""),
    icon: "/favicon.svg",
    tag: "new-email", // coalesces rapid notifications
    silent: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  // Auto-dismiss after 10 seconds
  setTimeout(() => notification.close(), 10_000);
}
