/**
 * Desktop notification helpers for new email alerts.
 *
 * When running inside the Tauri desktop app (detected via window.__TAURI__),
 * notifications are routed through tauri-plugin-notification for native OS
 * integration. In the browser, the service worker is used when available
 * (so notifications work even when the tab is in the background), with a
 * fallback to the basic Web Notifications API.
 *
 * Also handles notification sound playback via the Web Audio API.
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
 * Lazily-created Audio element for notification sound.
 * Uses a tiny base64-encoded chime so we don't need an external file.
 */
let notificationAudio: HTMLAudioElement | null = null;

function getNotificationAudio(): HTMLAudioElement {
  if (!notificationAudio) {
    // A short, subtle notification chime encoded as a WAV data URI.
    // Generated programmatically: 2 quick sine-wave tones (C6 + E6), ~300ms total.
    notificationAudio = createNotificationChime();
  }
  return notificationAudio;
}

/**
 * Create a short notification chime using the Web Audio API,
 * rendered to an Audio element for easy replaying.
 */
function createNotificationChime(): HTMLAudioElement {
  const sampleRate = 22050;
  const duration = 0.3;
  const numSamples = Math.floor(sampleRate * duration);

  // Generate PCM samples: two quick ascending tones
  const samples = new Float32Array(numSamples);
  const freq1 = 1047; // C6
  const freq2 = 1319; // E6
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.max(0, 1 - t / duration) * 0.3;
    const tone =
      t < 0.15
        ? Math.sin(2 * Math.PI * freq1 * t)
        : Math.sin(2 * Math.PI * freq2 * t);
    samples[i] = tone * envelope;
  }

  // Encode as WAV
  const wavBuffer = encodeWAV(samples, sampleRate);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.volume = 0.5;
  return audio;
}

/** Encode Float32 samples as a 16-bit PCM WAV file. */
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Write samples
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Play the notification sound if the sound setting is enabled. */
function playNotificationSound(): void {
  const { notifications } = useSettingsStore.getState();
  if (!notifications.sound) return;

  try {
    const audio = getNotificationAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay may be blocked — silently ignore
    });
  } catch {
    // Audio API not available
  }
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
 * Get the active service worker registration, if available.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
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

  // Play notification sound (browser tab only, not in SW)
  playNotificationSound();

  if (isTauri()) {
    showTauriNotification(sender, body);
    return;
  }

  // Browser fallback.
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  // Prefer service worker notifications — they work even when the tab is backgrounded
  void showBrowserNotification(sender, body);
}

/**
 * Show a notification via the service worker if available,
 * falling back to the basic Notification API.
 */
async function showBrowserNotification(title: string, body: string): Promise<void> {
  const registration = await getServiceWorkerRegistration();

  if (registration) {
    // Service worker notification — works in background
    await registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      tag: "new-email",
      silent: true, // We handle sound ourselves
      data: { url: "/" },
    });
    return;
  }

  // Fallback: basic Web Notification API
  const notification = new Notification(title, {
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
