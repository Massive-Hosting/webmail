/**
 * Desktop notification helpers for new email alerts.
 *
 * When running inside the Tauri desktop app (detected via window.__TAURI__),
 * notifications are routed through tauri-plugin-notification for native OS
 * integration. Otherwise, falls back to the Web Notifications API.
 */

import { useSettingsStore } from "@/stores/settings-store.ts";
import type { EmailListItem } from "@/types/mail.ts";

/** Whether we're running inside the Tauri desktop shell. */
const isTauri = () => "__TAURI__" in window;

/** Format sender display name from an email's `from` field */
function formatSender(email: EmailListItem): string {
  const addr = email.from?.[0];
  if (!addr) return "Unknown sender";
  return addr.name || addr.email;
}

/**
 * Request notification permission.
 * In Tauri, permissions are granted at OS level — always returns true.
 * In browser, delegates to the Web Notifications API.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { requestPermission, isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );
      if (await isPermissionGranted()) return true;
      const result = await requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  }

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
 * - Permission must be granted
 * - In browser: the tab must NOT be focused
 */
export function showEmailNotification(email: EmailListItem): void {
  const { notifications } = useSettingsStore.getState();
  if (!notifications.enabled) return;

  const sender = formatSender(email);
  const subject = email.subject || "(no subject)";
  const preview = email.preview?.slice(0, 100) ?? "";
  const body = subject + (preview ? "\n" + preview : "");

  if (isTauri()) {
    showTauriNotification(sender, body);
    return;
  }

  // Browser fallback.
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  const notification = new Notification(sender, {
    body,
    icon: "/favicon.svg",
    tag: "new-email",
    silent: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  setTimeout(() => notification.close(), 10_000);
}

/** Send a native notification via Tauri. */
async function showTauriNotification(title: string, body: string) {
  try {
    const { sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    sendNotification({ title, body });
  } catch (err) {
    console.warn("[notifications] Tauri notification failed:", err);
  }
}
