/** Message list row components: regular item, thread header, and thread child */

import React, { useCallback, useState } from "react";
import type { EmailListItem } from "@/types/mail.ts";
import { isUnread, isFlagged } from "@/types/mail.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { formatMessageDate, formatAddress } from "@/lib/format.ts";
import {
  Star,
  Paperclip,
  ChevronRight,
  ChevronDown,
  Printer,
  Clock,
  Reply,
  ReplyAll,
  Forward,
  MailOpen,
  Mail,
  Archive,
  Trash2,
} from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTranslation } from "react-i18next";
import { DateTimePickerDialog } from "@/components/ui/datetime-picker-dialog.tsx";
import { addHours, setHours, setMinutes, setSeconds, addDays, nextMonday, isPast, format } from "date-fns";
import { startSnooze } from "@/api/tasks.ts";
import { toast } from "sonner";

interface MessageListItemProps {
  email: EmailListItem;
  isSelected: boolean;
  isMultiSelected: boolean;
  onClick: (email: EmailListItem, event: React.MouseEvent) => void;
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
  /** IDs of all multi-selected emails (for drag-and-drop) */
  selectedEmailIds?: ReadonlySet<string>;
  /** Current mailbox ID (for drag-and-drop source) */
  currentMailboxId?: string | null;
}

export const MessageListItem = React.memo(
  function MessageListItem({
    email,
    isSelected,
    isMultiSelected,
    onClick,
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
    selectedEmailIds,
    currentMailboxId,
  }: MessageListItemProps) {
    const { t } = useTranslation();
    const unread = isUnread(email);
    const flagged = isFlagged(email);
    const sender = email.from?.[0] ?? { name: null, email: "unknown" };
    const [isDragging, setIsDragging] = useState(false);

    const handleStarClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onStar(email.id, !flagged);
      },
      [email.id, flagged, onStar],
    );

    const handleDragStart = useCallback(
      (e: React.DragEvent) => {
        const ids: string[] =
          selectedEmailIds && selectedEmailIds.size > 0 && (isMultiSelected || isSelected)
            ? Array.from(selectedEmailIds)
            : [email.id];
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ emailIds: ids, fromMailboxId: currentMailboxId }),
        );
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
      },
      [email.id, isMultiSelected, isSelected, selectedEmailIds, currentMailboxId],
    );

    const handleDragEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    const active = isSelected || isMultiSelected;

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className="message-list-item group"
            data-selected={active || undefined}
            data-unread={unread || undefined}
            data-dragging={isDragging || undefined}
            role="option"
            aria-selected={isSelected}
            draggable
            onClick={(e) => onClick(email, e)}
            onMouseEnter={() => onMouseEnter?.(email.id)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Unread indicator - small blue dot */}
            <div className="message-list-item__indicator">
              {unread && (
                <div className="message-list-item__unread-dot" />
              )}
            </div>

            {/* Avatar */}
            <div className="message-list-item__avatar">
              <Avatar address={sender} size={36} />
            </div>

            {/* Content area */}
            <div className="message-list-item__content">
              {/* Top row: sender + date */}
              <div className="message-list-item__top-row">
                <span className={`message-list-item__sender ${unread ? "message-list-item__sender--unread" : ""}`}>
                  {formatAddress(sender)}
                </span>
                <span className="message-list-item__date">
                  {formatMessageDate(email.receivedAt)}
                </span>
              </div>

              {/* Subject line */}
              <div className={`message-list-item__subject ${unread ? "message-list-item__subject--unread" : ""}`}>
                {email.subject || t("message.noSubject")}
              </div>

              {/* Preview text */}
              <div className="message-list-item__preview">
                {email.preview}
              </div>
            </div>

            {/* Right-side indicators */}
            <div className="message-list-item__actions">
              {email.keywords["$snoozed"] && (
                <Clock
                  size={14}
                  className="message-list-item__attachment-icon"
                  style={{ color: "var(--color-accent)" }}
                />
              )}
              {email.hasAttachment && (
                <Paperclip
                  size={14}
                  className="message-list-item__attachment-icon"
                />
              )}
              <button
                onClick={handleStarClick}
                className={`message-list-item__star-btn ${flagged ? "message-list-item__star-btn--active" : ""}`}
                aria-label={flagged ? t("action.removeStar") : t("action.addStar")}
              >
                <Star
                  size={15}
                  fill={flagged ? "currentColor" : "none"}
                  strokeWidth={flagged ? 0 : 1.5}
                />
              </button>
            </div>
          </div>
        </ContextMenu.Trigger>

        <MessageContextMenu
          email={email}
          unread={unread}
          flagged={flagged}
          currentMailboxId={currentMailboxId}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onProperties={onProperties}
          onPrint={onPrint}
        />
      </ContextMenu.Root>
    );
  },
  (prev, next) =>
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isMultiSelected === next.isMultiSelected &&
    prev.email.keywords === next.email.keywords &&
    prev.onReply === next.onReply &&
    prev.onReplyAll === next.onReplyAll &&
    prev.onForward === next.onForward &&
    prev.onMarkRead === next.onMarkRead &&
    prev.onArchive === next.onArchive &&
    prev.onDelete === next.onDelete &&
    prev.onProperties === next.onProperties &&
    prev.onPrint === next.onPrint &&
    prev.selectedEmailIds === next.selectedEmailIds &&
    prev.currentMailboxId === next.currentMailboxId,
);

/* ================================================================
   Thread header row - shows when a conversation has multiple messages
   ================================================================ */

interface ThreadHeaderItemProps {
  email: EmailListItem;
  messageCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: (event?: React.MouseEvent) => void;
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
  selectedEmailIds?: ReadonlySet<string>;
  currentMailboxId?: string | null;
}

export const ThreadHeaderItem = React.memo(
  function ThreadHeaderItem({
    email,
    messageCount,
    isExpanded,
    isSelected,
    onClick,
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
    selectedEmailIds,
    currentMailboxId,
  }: ThreadHeaderItemProps) {
    const { t } = useTranslation();
    const unread = isUnread(email);
    const flagged = isFlagged(email);
    const sender = email.from?.[0] ?? { name: null, email: "unknown" };
    const [isDragging, setIsDragging] = useState(false);

    const handleStarClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onStar(email.id, !flagged);
      },
      [email.id, flagged, onStar],
    );

    const handleDragStart = useCallback(
      (e: React.DragEvent) => {
        const ids: string[] =
          selectedEmailIds && selectedEmailIds.size > 0 && isSelected
            ? Array.from(selectedEmailIds)
            : [email.id];
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ emailIds: ids, fromMailboxId: currentMailboxId }),
        );
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
      },
      [email.id, isSelected, selectedEmailIds, currentMailboxId],
    );

    const handleDragEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
      <div
        className={`message-list-item message-list-item--thread-header group ${isExpanded ? "message-list-item--thread-expanded" : ""}`}
        data-selected={isSelected || undefined}
        data-unread={unread || undefined}
        data-dragging={isDragging || undefined}
        role="option"
        aria-selected={isSelected}
        aria-expanded={isExpanded}
        draggable
        onClick={(e) => onClick(e)}
        onMouseEnter={() => onMouseEnter?.(email.id)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Thread expand/collapse chevron */}
        <div className="message-list-item__thread-chevron">
          {isExpanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </div>

        {/* Avatar */}
        <div className="message-list-item__avatar">
          <Avatar address={sender} size={36} />
        </div>

        {/* Content area */}
        <div className="message-list-item__content">
          {/* Top row: sender + message count + date */}
          <div className="message-list-item__top-row">
            <span className={`message-list-item__sender ${unread ? "message-list-item__sender--unread" : ""}`}>
              {formatAddress(sender)}
            </span>
            <span className="message-list-item__thread-count">
              {messageCount}
            </span>
            <span className="message-list-item__date">
              {formatMessageDate(email.receivedAt)}
            </span>
          </div>

          {/* Subject line */}
          <div className={`message-list-item__subject ${unread ? "message-list-item__subject--unread" : ""}`}>
            {email.subject || t("message.noSubject")}
          </div>

          {/* Preview text */}
          <div className="message-list-item__preview">
            {email.preview}
          </div>
        </div>

        {/* Right-side indicators */}
        <div className="message-list-item__actions">
          {email.hasAttachment && (
            <Paperclip
              size={14}
              className="message-list-item__attachment-icon"
            />
          )}
          <button
            onClick={handleStarClick}
            className={`message-list-item__star-btn ${flagged ? "message-list-item__star-btn--active" : ""}`}
            aria-label={flagged ? t("action.removeStar") : t("action.addStar")}
          >
            <Star
              size={15}
              fill={flagged ? "currentColor" : "none"}
              strokeWidth={flagged ? 0 : 1.5}
            />
          </button>
        </div>
      </div>
        </ContextMenu.Trigger>
        <MessageContextMenu
          email={email}
          unread={unread}
          flagged={flagged}
          currentMailboxId={currentMailboxId}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onProperties={onProperties}
          onPrint={onPrint}
        />
      </ContextMenu.Root>
    );
  },
  (prev, next) =>
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isExpanded === next.isExpanded &&
    prev.messageCount === next.messageCount &&
    prev.email.keywords === next.email.keywords &&
    prev.selectedEmailIds === next.selectedEmailIds &&
    prev.currentMailboxId === next.currentMailboxId,
);

/* ================================================================
   Thread child row - individual message inside an expanded thread
   ================================================================ */

interface ThreadChildItemProps {
  email: EmailListItem;
  isSelected: boolean;
  isMultiSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onClick: (email: EmailListItem, event: React.MouseEvent) => void;
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
  selectedEmailIds?: ReadonlySet<string>;
  currentMailboxId?: string | null;
}

export const ThreadChildItem = React.memo(
  function ThreadChildItem({
    email,
    isSelected,
    isMultiSelected,
    isFirst,
    isLast,
    onClick,
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
    selectedEmailIds,
    currentMailboxId,
  }: ThreadChildItemProps) {
    const { t } = useTranslation();
    const unread = isUnread(email);
    const flagged = isFlagged(email);
    const sender = email.from?.[0] ?? { name: null, email: "unknown" };
    const [isDragging, setIsDragging] = useState(false);

    const handleStarClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onStar(email.id, !flagged);
      },
      [email.id, flagged, onStar],
    );

    const handleDragStart = useCallback(
      (e: React.DragEvent) => {
        const ids: string[] =
          selectedEmailIds && selectedEmailIds.size > 0 && (isMultiSelected || isSelected)
            ? Array.from(selectedEmailIds)
            : [email.id];
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ emailIds: ids, fromMailboxId: currentMailboxId }),
        );
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
      },
      [email.id, isMultiSelected, isSelected, selectedEmailIds, currentMailboxId],
    );

    const handleDragEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    const active = isSelected || isMultiSelected;

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={`message-list-item message-list-item--thread-child group ${isLast ? "message-list-item--thread-child-last" : ""}`}
            data-selected={active || undefined}
            data-unread={unread || undefined}
            data-dragging={isDragging || undefined}
            role="option"
            aria-selected={isSelected}
            draggable
            onClick={(e) => {
              e.stopPropagation();
              onClick(email, e);
            }}
            onMouseEnter={() => onMouseEnter?.(email.id)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Thread connector line */}
            <div className="message-list-item__thread-line">
              <div className={`message-list-item__thread-line-segment ${isLast ? "message-list-item__thread-line-segment--last" : ""}`} />
            </div>

            {/* Avatar (smaller) */}
            <div className="message-list-item__avatar">
              <Avatar address={sender} size={28} />
            </div>

            {/* Content area */}
            <div className="message-list-item__content">
              {/* Top row: sender + date */}
              <div className="message-list-item__top-row">
                <span className={`message-list-item__sender ${unread ? "message-list-item__sender--unread" : ""}`}>
                  {formatAddress(sender)}
                </span>
                <span className="message-list-item__date">
                  {formatMessageDate(email.receivedAt)}
                </span>
              </div>

              {/* Subject line */}
              <div className={`message-list-item__subject ${unread ? "message-list-item__subject--unread" : ""}`}>
                {email.subject || t("message.noSubject")}
              </div>
            </div>

            {/* Right-side indicators */}
            <div className="message-list-item__actions">
              {email.keywords["$snoozed"] && (
                <Clock
                  size={14}
                  className="message-list-item__attachment-icon"
                  style={{ color: "var(--color-accent)" }}
                />
              )}
              {email.hasAttachment && (
                <Paperclip
                  size={14}
                  className="message-list-item__attachment-icon"
                />
              )}
              <button
                onClick={handleStarClick}
                className={`message-list-item__star-btn ${flagged ? "message-list-item__star-btn--active" : ""}`}
                aria-label={flagged ? t("action.removeStar") : t("action.addStar")}
              >
                <Star
                  size={15}
                  fill={flagged ? "currentColor" : "none"}
                  strokeWidth={flagged ? 0 : 1.5}
                />
              </button>
            </div>
          </div>
        </ContextMenu.Trigger>

        <MessageContextMenu
          email={email}
          unread={unread}
          flagged={flagged}
          currentMailboxId={currentMailboxId}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onProperties={onProperties}
          onPrint={onPrint}
        />
      </ContextMenu.Root>
    );
  },
  (prev, next) =>
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isMultiSelected === next.isMultiSelected &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.email.keywords === next.email.keywords &&
    prev.onReply === next.onReply &&
    prev.onReplyAll === next.onReplyAll &&
    prev.onForward === next.onForward &&
    prev.onMarkRead === next.onMarkRead &&
    prev.onArchive === next.onArchive &&
    prev.onDelete === next.onDelete &&
    prev.onProperties === next.onProperties &&
    prev.onPrint === next.onPrint &&
    prev.selectedEmailIds === next.selectedEmailIds &&
    prev.currentMailboxId === next.currentMailboxId,
);

/* ================================================================
   Shared context menu for message items
   ================================================================ */

function MessageContextMenu({
  email,
  unread,
  flagged,
  currentMailboxId,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onStar,
  onArchive,
  onDelete,
  onProperties,
  onPrint,
}: {
  email: EmailListItem;
  unread: boolean;
  flagged: boolean;
  currentMailboxId?: string | null;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onStar: (emailId: string, flagged: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
  onProperties?: (email: EmailListItem) => void;
  onPrint?: (email: EmailListItem) => void;
}) {
  const { t } = useTranslation();
  const [showSnoozePicker, setShowSnoozePicker] = useState(false);

  const handleSnooze = useCallback((until: Date) => {
    startSnooze({
      emailId: email.id,
      mailboxId: currentMailboxId ?? "",
      until: until.toISOString(),
    }).then(() => {
      toast.success(t("action.snoozeSet", { time: format(until, "PPp") }));
    }).catch(() => {
      toast.error(t("tasks.failedToStart"));
    });
  }, [email.id, currentMailboxId, t]);

  return (
    <>
    <ContextMenu.Portal>
      <ContextMenu.Content
        className="min-w-[180px] p-1 text-sm animate-scale-in"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-primary)",
          boxShadow: "var(--shadow-lg)",
          borderRadius: "var(--radius-md)",
          zIndex: 50,
        }}
      >
        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onReply?.(email)}
        >
          <Reply size={14} />
          {t("action.reply")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onReplyAll?.(email)}
        >
          <ReplyAll size={14} />
          {t("action.replyAll")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onForward?.(email)}
        >
          <Forward size={14} />
          {t("action.forward")}
        </ContextMenu.Item>

        <ContextMenu.Separator
          className="my-1"
          style={{ borderTop: "1px solid var(--color-border-primary)" }}
        />

        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onMarkRead?.([email.id], unread)}
        >
          {unread ? <MailOpen size={14} /> : <Mail size={14} />}
          {unread ? t("action.markAsRead") : t("action.markAsUnread")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onStar(email.id, !flagged)}
        >
          <Star size={14} />
          {flagged ? t("action.unstar") : t("action.star")}
        </ContextMenu.Item>

        <ContextMenu.Separator
          className="my-1"
          style={{ borderTop: "1px solid var(--color-border-primary)" }}
        />

        <ContextMenu.Sub>
          <ContextMenu.SubTrigger
            className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          >
            <Clock size={14} />
            {t("action.snooze")}
          </ContextMenu.SubTrigger>
          <ContextMenu.Portal>
            <ContextMenu.SubContent
              className="min-w-[160px] p-1 text-sm"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-primary)",
                boxShadow: "var(--shadow-lg)",
                borderRadius: "var(--radius-md)",
                zIndex: 51,
              }}
            >
              <ContextMenu.Item
                className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
                onSelect={() => {
                  const now = new Date();
                  const hour = now.getHours();
                  handleSnooze(hour >= 15 ? addHours(now, 3) : setSeconds(setMinutes(setHours(now, 18), 0), 0));
                }}
              >
                {t("action.laterToday")}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
                onSelect={() => {
                  const tomorrow = addDays(new Date(), 1);
                  handleSnooze(setSeconds(setMinutes(setHours(tomorrow, 9), 0), 0));
                }}
              >
                {t("action.tomorrowMorning")}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
                onSelect={() => {
                  const monday = nextMonday(new Date());
                  handleSnooze(setSeconds(setMinutes(setHours(monday, 9), 0), 0));
                }}
              >
                {t("action.mondayMorning")}
              </ContextMenu.Item>
              <ContextMenu.Separator
                className="my-1"
                style={{ borderTop: "1px solid var(--color-border-primary)" }}
              />
              <ContextMenu.Item
                className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
                onSelect={() => {
                  setTimeout(() => setShowSnoozePicker(true), 100);
                }}
              >
                <Clock size={13} />
                {t("action.pickDateTime")}
              </ContextMenu.Item>
            </ContextMenu.SubContent>
          </ContextMenu.Portal>
        </ContextMenu.Sub>

        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onArchive?.([email.id])}
        >
          <Archive size={14} />
          {t("action.archive")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onPrint?.(email)}
        >
          <Printer size={14} />
          {t("action.print")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-danger)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onDelete?.([email.id])}
        >
          <Trash2 size={14} />
          {t("action.delete")}
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
    <DateTimePickerDialog
      open={showSnoozePicker}
      onOpenChange={setShowSnoozePicker}
      title={t("action.snooze")}
      onConfirm={handleSnooze}
    />
    </>
  );
}
