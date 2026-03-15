/** Virtualized message list using TanStack Virtual */

import React, { useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { EmailListItem } from "@/types/mail.ts";
import { MessageListItem } from "./message-list-item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import { usePrefetchMessage } from "@/hooks/use-message.ts";
import { Inbox } from "lucide-react";

function getDensityRowHeight(): number {
  const val = getComputedStyle(document.documentElement).getPropertyValue("--density-row-height").trim();
  return parseInt(val, 10) || 72;
}

const OVERSCAN = 10;

interface MessageListProps {
  emails: EmailListItem[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onFetchNextPage: () => void;
  onStarEmail: (emailId: string, flagged: boolean) => void;
}

export const MessageList = React.memo(function MessageList({
  emails,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onFetchNextPage,
  onStarEmail,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const selectedEmailIds = useUIStore((s) => s.selectedEmailIds);
  const setSelectedEmail = useUIStore((s) => s.setSelectedEmail);
  const toggleEmailSelection = useUIStore((s) => s.toggleEmailSelection);
  const selectEmailRange = useUIStore((s) => s.selectEmailRange);
  const prefetchMessage = usePrefetchMessage();

  const rowCount = emails.length + (hasNextPage ? 1 : 0);
  const rowHeight = getDensityRowHeight();

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  });

  // Fetch next page when near bottom
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    const lastItem = items[items.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= emails.length - 5 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onFetchNextPage();
    }
  }, [
    virtualizer.getVirtualItems(),
    emails.length,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage,
  ]);

  const handleItemClick = useCallback(
    (email: EmailListItem, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        toggleEmailSelection(email.id);
      } else if (event.shiftKey && selectedEmailId) {
        // Range select
        const startIdx = emails.findIndex((e) => e.id === selectedEmailId);
        const endIdx = emails.findIndex((e) => e.id === email.id);
        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          selectEmailRange(emails.slice(min, max + 1).map((e) => e.id));
        }
      } else {
        setSelectedEmail(email.id, email.threadId);
      }
    },
    [selectedEmailId, emails, setSelectedEmail, toggleEmailSelection, selectEmailRange],
  );

  const handleMouseEnter = useCallback(
    (emailId: string) => {
      // Prefetch on hover after 150ms
      const timer = setTimeout(() => prefetchMessage(emailId), 150);
      return () => clearTimeout(timer);
    },
    [prefetchMessage],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3" style={{ height: "var(--density-row-height)" }}>
            <div className="w-2" />
            <Skeleton width={36} height={36} rounded />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Skeleton width={120} height={14} />
                <div className="flex-1" />
                <Skeleton width={50} height={12} />
              </div>
              <Skeleton width="80%" height={14} />
              <Skeleton width="60%" height={12} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (emails.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={48} strokeWidth={1.5} />}
        title="No messages"
        description="This folder is empty. Messages that arrive here will show up in this list."
        className="h-full"
      />
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto"
      style={{ contain: "strict" }}
      role="listbox"
      aria-label="Messages"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          if (virtualRow.index >= emails.length) {
            // Loading indicator for next page
            return (
              <div
                key="loading"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: rowHeight,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-center justify-center"
              >
                <div className="flex items-center gap-3 px-3 w-full">
                  <div className="w-2" />
                  <Skeleton width={36} height={36} rounded />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <Skeleton width={120} height={14} />
                    <Skeleton width="80%" height={14} />
                    <Skeleton width="60%" height={12} />
                  </div>
                </div>
              </div>
            );
          }

          const email = emails[virtualRow.index];
          return (
            <div
              key={email.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: rowHeight,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageListItem
                email={email}
                isSelected={email.id === selectedEmailId}
                isMultiSelected={selectedEmailIds.has(email.id)}
                onClick={handleItemClick}
                onStar={onStarEmail}
                onMouseEnter={handleMouseEnter}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
