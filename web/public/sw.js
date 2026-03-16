/**
 * Service Worker for Webmail — handles notification click events
 * and push events (for future push notification support).
 *
 * This service worker intentionally does NOT cache any assets.
 */

// Skip waiting and claim clients immediately on install/activate
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Handle push events (for future server-push notification support).
 * Expects a JSON payload with { title, body, icon?, tag?, url? }.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "New email", body: event.data.text() };
  }

  const title = data.title || "New email";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.svg",
    tag: data.tag || "new-email",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Handle notification clicks — focus existing window or open a new one.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        // No existing window — open a new one
        return self.clients.openWindow(url);
      }),
  );
});
