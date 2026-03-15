/** Vertical icon bar for app-level navigation (Mail, Contacts, Calendar, Settings) */

import React from "react";
import { Mail, Users, Calendar, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useUIStore } from "@/stores/ui-store.ts";

interface ActivityBarProps {
  onSettings: () => void;
}

export const ActivityBar = React.memo(function ActivityBar({
  onSettings,
}: ActivityBarProps) {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="activity-bar">
        <div className="activity-bar__top">
          <ActivityBarIcon
            icon={sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            active={false}
            onClick={toggleSidebar}
          />
          <div style={{ height: 8 }} />
          <ActivityBarIcon
            icon={<Mail size={20} />}
            label="Mail"
            active={activeView === "mail"}
            onClick={() => setActiveView("mail")}
          />
          <ActivityBarIcon
            icon={<Users size={20} />}
            label="Contacts"
            active={activeView === "contacts"}
            onClick={() => setActiveView("contacts")}
          />
          <ActivityBarIcon
            icon={<Calendar size={20} />}
            label="Calendar"
            active={activeView === "calendar"}
            onClick={() => setActiveView("calendar")}
          />
        </div>
        <div className="activity-bar__bottom">
          <ActivityBarIcon
            icon={<Settings size={20} />}
            label="Settings"
            active={false}
            onClick={onSettings}
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className={`activity-bar__icon ${active ? "activity-bar__icon--active" : ""}`}
          aria-label={label}
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
