/** Sidebar with folder tree and navigation tabs — premium design */

import React, { lazy, Suspense } from "react";
import { FolderTree } from "@/components/mail/folder-tree.tsx";
import { ContactGroups } from "@/components/contacts/contact-groups.tsx";
import { useUIStore } from "@/stores/ui-store.ts";

const AgendaSidebar = lazy(() =>
  import("@/components/calendar/agenda-sidebar.tsx").then((m) => ({ default: m.AgendaSidebar }))
);
import type { AppView } from "@/stores/ui-store.ts";
import {
  Mail,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Sidebar = React.memo(function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const width = sidebarCollapsed ? 56 : sidebarWidth;

  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-hidden"
      style={{
        width,
        backgroundColor: "var(--color-bg-secondary)",
        borderRight: "1px solid var(--color-border-primary)",
        transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Navigation tabs */}
      <div
        className="shrink-0 px-2 py-2"
        style={{ borderBottom: "1px solid var(--color-border-primary)" }}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-0.5 w-full">
            <NavIcon
              icon={<Mail size={18} />}
              active={activeView === "mail"}
              label="Mail"
              onClick={() => setActiveView("mail")}
            />
            <NavIcon
              icon={<Users size={18} />}
              active={activeView === "contacts"}
              label="Contacts"
              onClick={() => setActiveView("contacts")}
            />
            <NavIcon
              icon={<Calendar size={18} />}
              active={activeView === "calendar"}
              label="Calendar"
              onClick={() => setActiveView("calendar")}
            />
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            <NavButton
              icon={<Mail size={15} />}
              label="Mail"
              active={activeView === "mail"}
              onClick={() => setActiveView("mail")}
            />
            <NavButton
              icon={<Users size={15} />}
              label="Contacts"
              active={activeView === "contacts"}
              onClick={() => setActiveView("contacts")}
            />
            <NavButton
              icon={<Calendar size={15} />}
              label="Calendar"
              active={activeView === "calendar"}
              onClick={() => setActiveView("calendar")}
            />
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!sidebarCollapsed && activeView === "mail" && (
          <>
            <FolderTree />
            <div
              className="mx-3 my-1"
              style={{ borderTop: "1px solid var(--color-border-primary)" }}
            />
            <Suspense fallback={<div />}>
              <AgendaSidebar
                onNavigateToEvent={() => setActiveView("calendar")}
              />
            </Suspense>
          </>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-9 shrink-0 transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
        style={{
          color: "var(--color-text-tertiary)",
          borderTop: "1px solid var(--color-border-primary)",
        }}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        onMouseOver={(e) => {
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.color = "var(--color-text-tertiary)";
        }}
      >
        {sidebarCollapsed ? (
          <ChevronRight size={15} />
        ) : (
          <ChevronLeft size={15} />
        )}
      </button>
    </div>
  );
});

function NavButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
      style={{
        backgroundColor: active ? "var(--color-message-selected)" : "transparent",
        color: active ? "var(--color-text-accent)" : "var(--color-text-secondary)",
        borderRadius: "var(--radius-sm)",
      }}
      onMouseOver={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function NavIcon({
  icon,
  active = false,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-10 transition-all duration-150"
      style={{
        height: "var(--density-sidebar-item)",
        backgroundColor: active ? "var(--color-message-selected)" : "transparent",
        color: active ? "var(--color-text-accent)" : "var(--color-text-secondary)",
        borderRadius: "var(--radius-sm)",
      }}
      title={label}
      onMouseOver={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
    >
      {icon}
    </button>
  );
}
