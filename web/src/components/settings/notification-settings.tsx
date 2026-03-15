/** Notification settings */

import React, { useCallback } from "react";
import { Bell, Volume2 } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store.ts";

export const NotificationSettings = React.memo(function NotificationSettings() {
  const notifications = useSettingsStore((s) => s.notifications);
  const setNotifications = useSettingsStore((s) => s.setNotifications);

  const handleToggleEnabled = useCallback(() => {
    if (!notifications.enabled) {
      // Request permission when enabling
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
    setNotifications({ enabled: !notifications.enabled });
  }, [notifications.enabled, setNotifications]);

  const notificationPermission =
    "Notification" in window ? Notification.permission : "denied";

  return (
    <div className="p-6 space-y-6">
      {/* Desktop notifications */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <Bell
            size={18}
            className="mt-0.5"
            style={{ color: "var(--color-text-secondary)" }}
          />
          <div>
            <h3
              className="text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Desktop notifications
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Show a browser notification when new mail arrives.
            </p>
            {notificationPermission === "denied" && notifications.enabled && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--color-text-danger)" }}
              >
                Browser notifications are blocked. Allow them in your browser settings.
              </p>
            )}
          </div>
        </div>
        <ToggleSwitch
          checked={notifications.enabled}
          onChange={handleToggleEnabled}
        />
      </div>

      {/* Sound */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <Volume2
            size={18}
            className="mt-0.5"
            style={{ color: "var(--color-text-secondary)" }}
          />
          <div>
            <h3
              className="text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Notification sound
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Play a sound for new messages. (Coming soon)
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={notifications.sound}
          onChange={() => setNotifications({ sound: !notifications.sound })}
        />
      </div>
    </div>
  );
});

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
      role="switch"
      aria-checked={checked}
      style={{
        backgroundColor: checked
          ? "var(--color-bg-accent)"
          : "var(--color-bg-tertiary)",
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? "translateX(22px)" : "translateX(4px)",
        }}
      />
    </button>
  );
}
