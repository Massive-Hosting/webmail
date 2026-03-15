/** Virtualized message list with inline thread expansion (Outlook-style) */

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { EmailListItem } from "@/types/mail.ts";
import { MessageListItem, ThreadHeaderItem, ThreadChildItem } from "./message-list-item.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import { usePrefetchMessage } from "@/hooks/use-message.ts";
import { useThreadMessages } from "@/hooks/use-thread-messages.ts";
import { Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDateGroup, getDateGroupLabel } from "@/lib/format.ts";

function getDensityRowHeight(): number {
  const val = getComputedStyle(document.documentElement).getPropertyValue("--density-row-height").trim();
  return parseInt(val, 10) || 72;
}

const OVERSCAN = 10;
const DATE_GROUP_HEADER_HEIGHT = 28;

/** A virtual row can be a standalone message, a thread header, a thread child, or a date group header */
type VirtualRow =
  | { type: "message"; email: EmailListItem }
  | { type: "thread-header"; email: EmailListItem; threadId: string; messageCount: number; isExpanded: boolean }
  | { type: "thread-child"; email: EmailListItem; threadId: string; isFirst: boolean; isLast: boolean }
  | { type: "date-group-header"; group: string; label: string };

interface MessageListProps {
  emails: EmailListItem[];
  threadCounts: Record<string, number>;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onFetchNextPage: () => void;
  onStarEmail: (emailId: string, flagged: boolean) => void;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
}

/** Component that fetches and renders thread children when a thread is expanded */
function ExpandedThreadChildren({
  threadId,
  parentEmail,
  rowHeight,
  onSelectMessage,
  selectedEmailId,
  onStar,
  onMouseEnter,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onArchive,
  onDelete,
}: {
  threadId: string;
  parentEmail: EmailListItem;
  rowHeight: number;
  onSelectMessage: (email: EmailListItem) => void;
  selectedEmailId: string | null;
  onStar: (emailId: string, flagged: boolean) => void;
  onMouseEnter?: (emailId: string) => void;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
}) {
  const { emails, isLoading } = useThreadMessages(threadId);

  if (isLoading) {
    return (
      <div className="thread-children-loading">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="message-list-skeleton__row" style={{ height: rowHeight, paddingLeft: 28 }}>
            <div className="message-list-skeleton__dot-space" />
            <Skeleton width={36} height={36} rounded />
            <div className="message-list-skeleton__content">
              <Skeleton width={120} height={14} />
              <Skeleton width="80%" height={14} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) return null;

  return (
    <>
      {emails.map((email, index) => (
        <ThreadChildItem
          key={email.id}
          email={email}
          isSelected={email.id === selectedEmailId}
          isFirst={index === 0}
          isLast={index === emails.length - 1}
          onClick={onSelectMessage}
          onStar={onStar}
          onMouseEnter={onMouseEnter}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

export const MessageList = React.memo(function MessageList({
  emails,
  threadCounts,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onFetchNextPage,
  onStarEmail,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onArchive,
  onDelete,
}: MessageListProps) {
  const { t, i18n } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const selectedEmailIds = useUIStore((s) => s.selectedEmailIds);
  const lastClickedEmailId = useUIStore((s) => s.lastClickedEmailId);
  const expandedThreads = useUIStore((s) => s.expandedThreads);
  const setSelectedEmail = useUIStore((s) => s.setSelectedEmail);
  const toggleEmailSelection = useUIStore((s) => s.toggleEmailSelection);
  const selectEmailRange = useUIStore((s) => s.selectEmailRange);
  const toggleThread = useUIStore((s) => s.toggleThread);
  const prefetchMessage = usePrefetchMessage();

  const rowHeight = getDensityRowHeight();

  const i18nLanguage = i18n.language;

  // Build the virtual rows: for each email, either show as standalone, thread header,
  // or (if expanded) thread header + thread children placeholders.
  // Insert date group header rows when the date group changes.
  const rows = useMemo(() => {
    const result: VirtualRow[] = [];
    let lastGroup = "";
    for (const email of emails) {
      const group = getDateGroup(email.receivedAt);
      if (group !== lastGroup) {
        result.push({
          type: "date-group-header",
          group,
          label: getDateGroupLabel(group, t, i18nLanguage),
        });
        lastGroup = group;
      }
      const count = threadCounts[email.threadId] ?? 1;
      if (count <= 1) {
        // Single message, not a thread
        result.push({ type: "message", email });
      } else {
        // Thread header
        const isExpanded = expandedThreads.has(email.threadId);
        result.push({
          type: "thread-header",
          email,
          threadId: email.threadId,
          messageCount: count,
          isExpanded,
        });
        // If expanded, we add a single "placeholder" row that will render the
        // ExpandedThreadChildren component (which handles its own layout)
        // We don't add individual rows because we don't know how many there are
        // until the data is fetched. Instead we use a dynamic-height approach.
      }
    }
    return result;
  }, [emails, threadCounts, expandedThreads, t, i18nLanguage]);

  // For the virtualizer, we need a count that includes expanded thread children.
  // We'll use a non-virtualized approach for expanded thread children to avoid
  // complexity with dynamic row counts. Instead, the thread children render
  // as a normal flow below their header.

  const handleItemClick = useCallback(
    (email: EmailListItem, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        toggleEmailSelection(email.id);
      } else if (event.shiftKey && lastClickedEmailId) {
        const startIdx = emails.findIndex((e) => e.id === lastClickedEmailId);
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
    [lastClickedEmailId, emails, setSelectedEmail, toggleEmailSelection, selectEmailRange],
  );

  const handleThreadHeaderClick = useCallback(
    (email: EmailListItem, threadId: string) => {
      toggleThread(threadId);
      // If we're expanding (not collapsing), auto-select latest message
      // The actual selection happens after data loads via ExpandedThreadChildren
      if (!expandedThreads.has(threadId)) {
        // Thread is being expanded - select the header email for now
        // (the latest message will be auto-selected after thread data loads)
        setSelectedEmail(email.id, threadId);
      }
    },
    [toggleThread, expandedThreads, setSelectedEmail],
  );

  const handleThreadChildSelect = useCallback(
    (email: EmailListItem) => {
      setSelectedEmail(email.id, email.threadId);
    },
    [setSelectedEmail],
  );

  const handleMouseEnter = useCallback(
    (emailId: string) => {
      const timer = setTimeout(() => prefetchMessage(emailId), 150);
      return () => clearTimeout(timer);
    },
    [prefetchMessage],
  );

  // Loading state with shimmer skeletons
  if (isLoading) {
    return (
      <div className="message-list-skeleton">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="message-list-skeleton__row" style={{ height: "var(--density-row-height)" }}>
            <div className="message-list-skeleton__dot-space" />
            <Skeleton width={36} height={36} rounded />
            <div className="message-list-skeleton__content">
              <div className="message-list-skeleton__top">
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
        icon={<Inbox size={48} strokeWidth={1} />}
        title={t("message.noMessages")}
        description={t("message.emptyFolder")}
        className="h-full"
      />
    );
  }

  // Render with simple overflow scroll instead of virtualizer when threads are expanded
  // This avoids complexity of dynamic row heights with TanStack Virtual
  const hasExpandedThreads = expandedThreads.size > 0;

  if (hasExpandedThreads) {
    return (
      <div
        ref={parentRef}
        className="message-list"
        style={{ contain: "layout style" }}
        role="listbox"
        aria-label={t("message.messages")}
      >
        {rows.map((row, rowIndex) => {
          if (row.type === "date-group-header") {
            return (
              <div key={`group-${row.group}`} style={{ height: DATE_GROUP_HEADER_HEIGHT }}>
                <DateGroupHeader label={row.label} />
              </div>
            );
          }

          if (row.type === "message") {
            return (
              <div key={row.email.id} style={{ height: rowHeight }}>
                <MessageListItem
                  email={row.email}
                  isSelected={row.email.id === selectedEmailId}
                  isMultiSelected={selectedEmailIds.has(row.email.id)}
                  onClick={handleItemClick}
                  onStar={onStarEmail}
                  onMouseEnter={handleMouseEnter}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onForward={onForward}
                  onMarkRead={onMarkRead}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              </div>
            );
          }

          if (row.type === "thread-header") {
            return (
              <div key={`thread-${row.threadId}`}>
                <div style={{ height: rowHeight }}>
                  <ThreadHeaderItem
                    email={row.email}
                    messageCount={row.messageCount}
                    isExpanded={row.isExpanded}
                    isSelected={row.email.id === selectedEmailId}
                    onClick={() => handleThreadHeaderClick(row.email, row.threadId)}
                    onStar={onStarEmail}
                    onMouseEnter={handleMouseEnter}
                  />
                </div>
                {row.isExpanded && (
                  <ExpandedThreadChildren
                    threadId={row.threadId}
                    parentEmail={row.email}
                    rowHeight={rowHeight}
                    onSelectMessage={handleThreadChildSelect}
                    selectedEmailId={selectedEmailId}
                    onStar={onStarEmail}
                    onMouseEnter={handleMouseEnter}
                    onReply={onReply}
                    onReplyAll={onReplyAll}
                    onForward={onForward}
                    onMarkRead={onMarkRead}
                    onArchive={onArchive}
                    onDelete={onDelete}
                  />
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Loading indicator for next page */}
        {hasNextPage && (
          <LoadMoreTrigger onFetchNextPage={onFetchNextPage} isFetchingNextPage={isFetchingNextPage} rowHeight={rowHeight} />
        )}
      </div>
    );
  }

  // Default: virtualized list when no threads are expanded
  return (
    <VirtualizedMessageList
      parentRef={parentRef}
      rows={rows}
      emails={emails}
      rowHeight={rowHeight}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      selectedEmailId={selectedEmailId}
      selectedEmailIds={selectedEmailIds}
      onFetchNextPage={onFetchNextPage}
      onItemClick={handleItemClick}
      onThreadHeaderClick={handleThreadHeaderClick}
      onStarEmail={onStarEmail}
      onMouseEnter={handleMouseEnter}
      onReply={onReply}
      onReplyAll={onReplyAll}
      onForward={onForward}
      onMarkRead={onMarkRead}
      onArchive={onArchive}
      onDelete={onDelete}
      t={t}
    />
  );
});

/** Virtualized list for when no threads are expanded */
function VirtualizedMessageList({
  parentRef,
  rows,
  emails,
  rowHeight,
  hasNextPage,
  isFetchingNextPage,
  selectedEmailId,
  selectedEmailIds,
  onFetchNextPage,
  onItemClick,
  onThreadHeaderClick,
  onStarEmail,
  onMouseEnter,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onArchive,
  onDelete,
  t,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  rows: VirtualRow[];
  emails: EmailListItem[];
  rowHeight: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  selectedEmailId: string | null;
  selectedEmailIds: Set<string>;
  onFetchNextPage: () => void;
  onItemClick: (email: EmailListItem, event: React.MouseEvent) => void;
  onThreadHeaderClick: (email: EmailListItem, threadId: string) => void;
  onStarEmail: (emailId: string, flagged: boolean) => void;
  onMouseEnter: (emailId: string) => void;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
  t: (key: string) => string;
}) {
  const rowCount = rows.length + (hasNextPage ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (index < rows.length && rows[index].type === "date-group-header") {
        return DATE_GROUP_HEADER_HEIGHT;
      }
      return rowHeight;
    },
    overscan: OVERSCAN,
  });

  // Fetch next page when near bottom
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    const lastItem = items[items.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= rows.length - 5 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onFetchNextPage();
    }
  }, [
    virtualizer.getVirtualItems(),
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage,
  ]);

  return (
    <div
      ref={parentRef}
      className="message-list"
      style={{ contain: "strict" }}
      role="listbox"
      aria-label={t("message.messages")}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          if (virtualRow.index >= rows.length) {
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
                className="message-list-skeleton__row"
              >
                <div className="message-list-skeleton__dot-space" />
                <Skeleton width={36} height={36} rounded />
                <div className="message-list-skeleton__content">
                  <Skeleton width={120} height={14} />
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="60%" height={12} />
                </div>
              </div>
            );
          }

          const row = rows[virtualRow.index];

          if (row.type === "date-group-header") {
            return (
              <div
                key={`group-${row.group}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: DATE_GROUP_HEADER_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <DateGroupHeader label={row.label} />
              </div>
            );
          }

          if (row.type === "message") {
            return (
              <div
                key={row.email.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: rowHeight,
                  overflow: "hidden",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageListItem
                  email={row.email}
                  isSelected={row.email.id === selectedEmailId}
                  isMultiSelected={selectedEmailIds.has(row.email.id)}
                  onClick={onItemClick}
                  onStar={onStarEmail}
                  onMouseEnter={onMouseEnter}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onForward={onForward}
                  onMarkRead={onMarkRead}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              </div>
            );
          }

          if (row.type === "thread-header") {
            return (
              <div
                key={`thread-${row.threadId}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: rowHeight,
                  overflow: "hidden",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ThreadHeaderItem
                  email={row.email}
                  messageCount={row.messageCount}
                  isExpanded={false}
                  isSelected={row.email.id === selectedEmailId}
                  onClick={() => onThreadHeaderClick(row.email, row.threadId)}
                  onStar={onStarEmail}
                  onMouseEnter={onMouseEnter}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

/** Date group separator shown between messages of different date groups */
function DateGroupHeader({ label }: { label: string }) {
  return (
    <div className="date-group-header" role="separator" aria-label={label}>
      <span className="date-group-header__label">{label}</span>
      <div className="date-group-header__line" />
    </div>
  );
}

/** Trigger that calls onFetchNextPage when scrolled into view */
function LoadMoreTrigger({
  onFetchNextPage,
  isFetchingNextPage,
  rowHeight,
}: {
  onFetchNextPage: () => void;
  isFetchingNextPage: boolean;
  rowHeight: number;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!triggerRef.current || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onFetchNextPage();
        }
      },
      { threshold: 0 },
    );
    observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [onFetchNextPage, isFetchingNextPage]);

  return (
    <div ref={triggerRef} className="message-list-skeleton__row" style={{ height: rowHeight }}>
      <div className="message-list-skeleton__dot-space" />
      <Skeleton width={36} height={36} rounded />
      <div className="message-list-skeleton__content">
        <Skeleton width={120} height={14} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="60%" height={12} />
      </div>
    </div>
  );
}
