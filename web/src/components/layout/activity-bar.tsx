/** Vertical icon bar for app-level navigation (Mail, Contacts, Calendar) */

import React from "react";
import { Mail, Users, Calendar, PanelLeftClose, PanelLeft } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useUIStore } from "@/stores/ui-store.ts";
import { useTranslation } from "react-i18next";

/** Active color palette for each nav icon */
const ICON_ACTIVE_COLORS: Record<string, string> = {
  mail: "#3b82f6",     // blue
  contacts: "#22c55e", // green
  calendar: "#f59e0b", // amber
};

export const ActivityBar = React.memo(function ActivityBar() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { t } = useTranslation();

  const mailActive = activeView === "mail";
  const contactsActive = activeView === "contacts";
  const calendarActive = activeView === "calendar";

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="activity-bar">
        <div className="activity-bar__top">
          <ActivityBarIcon
            icon={<Mail size={20} />}
            label={t("nav.mail")}
            active={mailActive}
            activeColor={ICON_ACTIVE_COLORS.mail}
            onClick={() => setActiveView("mail")}
          />
          <ActivityBarIcon
            icon={<Users size={20} />}
            label={t("nav.contacts")}
            active={contactsActive}
            activeColor={ICON_ACTIVE_COLORS.contacts}
            onClick={() => setActiveView("contacts")}
          />
          <ActivityBarIcon
            icon={<Calendar size={20} />}
            label={t("nav.calendar")}
            active={calendarActive}
            activeColor={ICON_ACTIVE_COLORS.calendar}
            onClick={() => setActiveView("calendar")}
          />
        </div>
        <div className="activity-bar__bottom">
          <ActivityBarIcon
            icon={sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            label={sidebarCollapsed ? t("nav.showSidebar") : t("nav.hideSidebar")}
            active={false}
            onClick={toggleSidebar}
          />
        </div>
      </div>
    </Tooltip.Provider>
  );
});

function ActivityBarIcon({
  icon,
  label,
  active,
  activeColor,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeColor?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className={`activity-bar__icon ${active ? "activity-bar__icon--active" : ""}`}
          aria-label={label}
          style={active && activeColor ? { color: activeColor } : undefined}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content
        className="text-xs px-2.5 py-1.5 animate-scale-in"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--color-border-primary)",
          borderRadius: "var(--radius-sm)",
          fontWeight: 500,
        }}
        side="right"
        sideOffset={8}
      >
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}
