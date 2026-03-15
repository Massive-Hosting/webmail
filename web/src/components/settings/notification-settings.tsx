/** Notification settings */

import React, { useCallback, useState } from "react";
import { Bell, Volume2 } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { requestNotificationPermission } from "@/lib/notifications.ts";
import { useTranslation } from "react-i18next";

const isTauri = () => "__TAURI__" in window;

export const NotificationSettings = React.memo(function NotificationSettings() {
  const { t } = useTranslation();
  const notifications = useSettingsStore((s) => s.notifications);
  const setNotifications = useSettingsStore((s) => s.setNotifications);
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    isTauri() ? "granted" : ("Notification" in window ? Notification.permission : "denied"),
  );

  const handleToggleEnabled = useCallback(async () => {
    if (!notifications.enabled) {
      // Turning ON — request permission first
      const granted = await requestNotificationPermission();
      if (!isTauri()) {
        setPermissionState(
          "Notification" in window ? Notification.permission : "denied",
        );
      }
      if (!granted && !isTauri() && Notification.permission === "denied") {
        // Permission denied — turn on the toggle anyway so the user sees the
        // "blocked by browser" message, but notifications won't fire.
      }
    }
    setNotifications({ enabled: !notifications.enabled });
  }, [notifications.enabled, setNotifications]);

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
              {isTauri() ? t("notifications.nativeTitle", { defaultValue: "Native notifications" }) : t("notifications.desktopTitle")}
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {isTauri() ? t("notifications.nativeDesc", { defaultValue: "Show native OS notifications for new emails" }) : t("notifications.desktopDesc")}
            </p>
            {!isTauri() && permissionState === "denied" && notifications.enabled && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--color-text-danger)" }}
              >
                {t("notifications.blockedByBrowser")}
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
              {t("notifications.soundTitle")}
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {t("notifications.soundDesc")}
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
