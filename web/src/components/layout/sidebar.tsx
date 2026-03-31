/** Sidebar with folder tree — premium design */

import React, { lazy, Suspense } from "react";
import { FolderTree } from "@/components/mail/folder-tree.tsx";
import { SavedSearchesList } from "@/components/mail/saved-searches-list.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import { useWaveStore } from "@/stores/wave-store.ts";
import type { CallHistoryEntry } from "@/stores/wave-store.ts";
import { useWave } from "@/hooks/use-wave.ts";
import { formatDistanceToNow } from "date-fns";

const AgendaSidebar = lazy(() =>
  import("@/components/calendar/agenda-sidebar.tsx").then((m) => ({ default: m.AgendaSidebar }))
);
import {
  Phone,
  Video,
  PhoneCall,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export const Sidebar = React.memo(function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const width = sidebarCollapsed ? 0 : sidebarWidth;

  // Only show sidebar for mail view
  if (activeView !== "mail") return null;

  return (
    <nav
      aria-label="Mailbox folders"
      className="flex flex-col shrink-0 h-full overflow-hidden bg-secondary"
      style={{
        width,
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
            <RecentCalls />
            <div className="mx-3 my-1 border-t-primary" />
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

function RecentCalls() {
  const { t } = useTranslation();
  const callHistory = useWaveStore((s) => s.callHistory);
  const { startCall } = useWave();

  const recentCalls = callHistory.slice(0, 5);

  if (recentCalls.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide mb-1.5 px-1 text-tertiary">
        {t("sidebar.recentCalls", { defaultValue: "Recent Calls" })}
      </div>
      <div className="flex flex-col gap-0.5">
        {recentCalls.map((entry) => (
          <RecentCallItem key={entry.id} entry={entry} onCallAgain={startCall} />
        ))}
      </div>
    </div>
  );
}

function RecentCallItem({
  entry,
  onCallAgain,
}: {
  entry: CallHistoryEntry;
  onCallAgain: (peerEmail: string, video: boolean) => void;
}) {
  const displayName = entry.peerName || entry.peerEmail.split("@")[0];
  const timeAgo = formatDistanceToNow(entry.timestamp, { addSuffix: true });

  return (
    <div
      className="group flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-default"
    >
      <div className="text-tertiary" style={{ flexShrink: 0 }}>
        {entry.video ? <Video size={14} /> : <Phone size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate text-primary">
          {displayName}
        </div>
        <div className="text-[10px] truncate text-tertiary">
          {timeAgo}
        </div>
      </div>
      <button
        onClick={() => onCallAgain(entry.peerEmail, entry.video)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--color-bg-secondary)] transition-all text-secondary"
        title="Call again"
      >
        <PhoneCall size={13} />
      </button>
    </div>
  );
}
