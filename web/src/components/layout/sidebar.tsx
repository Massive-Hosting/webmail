/** Sidebar with folder tree — premium design */

import React, { lazy, Suspense, useState, useCallback, useRef, useEffect } from "react";
import { FolderTree } from "@/components/mail/folder-tree.tsx";
import { SavedSearchesList } from "@/components/mail/saved-searches-list.tsx";
import { useUIStore } from "@/stores/ui-store.ts";

const AgendaSidebar = lazy(() =>
  import("@/components/calendar/agenda-sidebar.tsx").then((m) => ({ default: m.AgendaSidebar }))
);
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export const Sidebar = React.memo(function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { t } = useTranslation();

  const width = sidebarCollapsed ? 0 : sidebarWidth;

  // Only show sidebar for mail view
  if (activeView !== "mail") return null;

  return (
    <nav
      aria-label="Mailbox folders"
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
            <SavedSearchesList />
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

      {/* Collapse toggle removed — activity bar has the toggle */}
    </nav>
  );
});
