/** Message list with inline thread expansion (Outlook-style) */

import React, { useRef, useCallback, useEffect, useMemo } from "react";
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
  onProperties?: (email: EmailListItem) => void;
  onPrint?: (email: EmailListItem) => void;
}

/** Component that fetches and renders thread children when a thread is expanded */
function ExpandedThreadChildren({
  threadId,
  parentEmail,
  rowHeight,
  onSelectMessage,
  selectedEmailId,
  selectedEmailIds,
  onStar,
  onMouseEnter,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onArchive,
  onDelete,
  onProperties,
  onPrint,
  currentMailboxId,
}: {
  threadId: string;
  parentEmail: EmailListItem;
  rowHeight: number;
  onSelectMessage: (email: EmailListItem, event: React.MouseEvent) => void;
  selectedEmailId: string | null;
  selectedEmailIds: ReadonlySet<string>;
  onStar: (emailId: string, flagged: boolean) => void;
  onMouseEnter?: (emailId: string) => void;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
  onProperties?: (email: EmailListItem) => void;
  onPrint?: (email: EmailListItem) => void;
  currentMailboxId?: string | null;
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
          isMultiSelected={selectedEmailIds.has(email.id)}
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
          onProperties={onProperties}
          onPrint={onPrint}
          selectedEmailIds={selectedEmailIds}
          currentMailboxId={currentMailboxId}
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
  onProperties,
  onPrint,
}: MessageListProps) {
  const { t, i18n } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const selectedEmailIds = useUIStore((s) => s.selectedEmailIds);
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
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

  // Build a flat list of all visible email IDs (including expanded thread children)
  // for shift+click range selection
  const visibleEmailIds = useMemo(() => {
    const ids: string[] = [];
    for (const row of rows) {
      if (row.type === "message" || row.type === "thread-header") {
        ids.push(row.email.id);
      }
      // Thread children are rendered by ExpandedThreadChildren and aren't in rows,
      // but they DO call handleItemClick. We'll handle this by falling back to
      // simple toggle when a child isn't in the visible list.
    }
    return ids;
  }, [rows]);

  const handleItemClick = useCallback(
    (email: EmailListItem, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        toggleEmailSelection(email.id);
      } else if (event.shiftKey) {
        event.preventDefault();
        if (lastClickedEmailId) {
          const startIdx = visibleEmailIds.indexOf(lastClickedEmailId);
          const endIdx = visibleEmailIds.indexOf(email.id);
          if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx);
            const max = Math.max(startIdx, endIdx);
            selectEmailRange(visibleEmailIds.slice(min, max + 1));
          } else {
            // One of the IDs not in visible list (e.g., thread child) — toggle instead
            toggleEmailSelection(email.id);
          }
        } else {
          setSelectedEmail(email.id, email.threadId);
        }
      } else {
        setSelectedEmail(email.id, email.threadId);
      }
    },
    [lastClickedEmailId, visibleEmailIds, setSelectedEmail, toggleEmailSelection, selectEmailRange],
  );

  const handleThreadHeaderClick = useCallback(
    (email: EmailListItem, threadId: string, event?: React.MouseEvent) => {
      // If shift/ctrl held, handle multi-select instead of expand/collapse
      if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        handleItemClick(email, event);
        return;
      }

      const isExpanded = expandedThreads.has(threadId);

      if (!isExpanded) {
        // Collapsed → expand and select the header (latest message auto-selected after load)
        toggleThread(threadId);
        setSelectedEmail(email.id, threadId);
      } else if (selectedEmailId !== email.id) {
        // Expanded AND a child (or something else) is selected → select the parent, do NOT collapse
        setSelectedEmail(email.id, threadId);
      } else {
        // Expanded AND parent is already selected → collapse
        toggleThread(threadId);
      }
    },
    [toggleThread, expandedThreads, setSelectedEmail, selectedEmailId, handleItemClick],
  );

  const handleThreadChildSelect = useCallback(
    (email: EmailListItem, event: React.MouseEvent) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        handleItemClick(email, event);
        return;
      }
      setSelectedEmail(email.id, email.threadId);
    },
    [setSelectedEmail, handleItemClick],
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

  return (
    <div
      ref={parentRef}
      className="message-list"
      role="listbox"
      aria-label={t("message.messages")}
    >
      {rows.map((row) => {
        if (row.type === "date-group-header") {
          return (
            <div key={`group-${row.group}`}>
              <DateGroupHeader label={row.label} />
            </div>
          );
        }

        if (row.type === "message") {
          return (
            <div key={row.email.id}>
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
                onProperties={onProperties}
                onPrint={onPrint}
                selectedEmailIds={selectedEmailIds}
                currentMailboxId={selectedMailboxId}
              />
            </div>
          );
        }

        if (row.type === "thread-header") {
          return (
            <div key={`thread-${row.threadId}`}>
              <div>
                <ThreadHeaderItem
                  email={row.email}
                  messageCount={row.messageCount}
                  isExpanded={row.isExpanded}
                  isSelected={row.email.id === selectedEmailId}
                  onClick={(e?: React.MouseEvent) => handleThreadHeaderClick(row.email, row.threadId, e)}
                  onStar={onStarEmail}
                  onMouseEnter={handleMouseEnter}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onForward={onForward}
                  onMarkRead={onMarkRead}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onProperties={onProperties}
                  onPrint={onPrint}
                  selectedEmailIds={selectedEmailIds}
                  currentMailboxId={selectedMailboxId}
                />
              </div>
              {row.isExpanded && (
                <ExpandedThreadChildren
                  threadId={row.threadId}
                  parentEmail={row.email}
                  rowHeight={rowHeight}
                  onSelectMessage={handleThreadChildSelect}
                  selectedEmailId={selectedEmailId}
                  selectedEmailIds={selectedEmailIds}
                  onStar={onStarEmail}
                  onMouseEnter={handleMouseEnter}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onForward={onForward}
                  onMarkRead={onMarkRead}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onProperties={onProperties}
                  onPrint={onPrint}
                  currentMailboxId={selectedMailboxId}
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
});

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
    <div ref={triggerRef} className="message-list-skeleton__row">
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
