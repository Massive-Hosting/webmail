/** Sidebar with folder tree — premium design */

import React, { lazy, Suspense } from "react";
import { FolderTree } from "@/components/mail/folder-tree.tsx";
import { useUIStore } from "@/stores/ui-store.ts";

const AgendaSidebar = lazy(() =>
  import("@/components/calendar/agenda-sidebar.tsx").then((m) => ({ default: m.AgendaSidebar }))
);
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Sidebar = React.memo(function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const width = sidebarCollapsed ? 0 : sidebarWidth;

  // Only show sidebar for mail view
  if (activeView !== "mail") return null;

  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-hidden"
      style={{
        width,
        backgroundColor: "var(--color-bg-secondary)",
        borderRight: sidebarCollapsed ? "none" : "1px solid var(--color-border-primary)",
        transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!sidebarCollapsed && (
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
      {!sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center h-9 shrink-0 transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{
            color: "var(--color-text-tertiary)",
            borderTop: "1px solid var(--color-border-primary)",
          }}
          aria-label="Collapse sidebar"
          onMouseOver={(e) => {
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = "var(--color-text-tertiary)";
          }}
        >
          <ChevronLeft size={15} />
        </button>
      )}
    </div>
  );
});
