/** Message list row components: regular item, thread header, and thread child */

import React, { useCallback } from "react";
import type { EmailListItem } from "@/types/mail.ts";
import { isUnread, isFlagged } from "@/types/mail.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { formatMessageDate, formatAddress } from "@/lib/format.ts";
import { Star, Paperclip, ChevronRight, ChevronDown, Check } from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTranslation } from "react-i18next";

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
  }: MessageListItemProps) {
    const { t } = useTranslation();
    const unread = isUnread(email);
    const flagged = isFlagged(email);
    const sender = email.from?.[0] ?? { name: null, email: "unknown" };

    const handleStarClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onStar(email.id, !flagged);
      },
      [email.id, flagged, onStar],
    );

    const active = isSelected || isMultiSelected;

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className="message-list-item group"
            data-selected={active || undefined}
            data-unread={unread || undefined}
            role="option"
            aria-selected={isSelected}
            onClick={(e) => onClick(email, e)}
            onMouseEnter={() => onMouseEnter?.(email.id)}
          >
            {/* Unread indicator - small blue dot */}
            <div className="message-list-item__indicator">
              {unread && (
                <div className="message-list-item__unread-dot" />
              )}
            </div>

            {/* Avatar / checkmark when multi-selected */}
            <div className="message-list-item__avatar">
              {isMultiSelected ? (
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  backgroundColor: "var(--color-bg-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check size={18} style={{ color: "#fff" }} />
                </div>
              ) : (
                <Avatar address={sender} size={36} />
              )}
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
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onProperties={onProperties}
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
    prev.onProperties === next.onProperties,
);

/* ================================================================
   Thread header row - shows when a conversation has multiple messages
   ================================================================ */

interface ThreadHeaderItemProps {
  email: EmailListItem;
  messageCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
  onStar: (emailId: string, flagged: boolean) => void;
  onMouseEnter?: (emailId: string) => void;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
  onProperties?: (email: EmailListItem) => void;
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
  }: ThreadHeaderItemProps) {
    const { t } = useTranslation();
    const unread = isUnread(email);
    const flagged = isFlagged(email);
    const sender = email.from?.[0] ?? { name: null, email: "unknown" };

    const handleStarClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onStar(email.id, !flagged);
      },
      [email.id, flagged, onStar],
    );

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
      <div
        className={`message-list-item message-list-item--thread-header group ${isExpanded ? "message-list-item--thread-expanded" : ""}`}
        data-selected={isSelected || undefined}
        data-unread={unread || undefined}
        role="option"
        aria-selected={isSelected}
        aria-expanded={isExpanded}
        onClick={onClick}
        onMouseEnter={() => onMouseEnter?.(email.id)}
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
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onProperties={onProperties}
        />
      </ContextMenu.Root>
    );
  },
  (prev, next) =>
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isExpanded === next.isExpanded &&
    prev.messageCount === next.messageCount &&
    prev.email.keywords === next.email.keywords,
);

/* ================================================================
   Thread child row - individual message inside an expanded thread
   ================================================================ */

interface ThreadChildItemProps {
  email: EmailListItem;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onClick: (email: EmailListItem) => void;
  onStar: (emailId: string, flagged: boolean) => void;
  onMouseEnter?: (emailId: string) => void;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
  onProperties?: (email: EmailListItem) => void;
}

export const ThreadChildItem = React.memo(
  function ThreadChildItem({
    email,
    isSelected,
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
  }: ThreadChildItemProps) {
    const { t } = useTranslation();
    const unread = isUnread(email);
    const flagged = isFlagged(email);
    const sender = email.from?.[0] ?? { name: null, email: "unknown" };

    const handleStarClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onStar(email.id, !flagged);
      },
      [email.id, flagged, onStar],
    );

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={`message-list-item message-list-item--thread-child group ${isLast ? "message-list-item--thread-child-last" : ""}`}
            data-selected={isSelected || undefined}
            data-unread={unread || undefined}
            role="option"
            aria-selected={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              onClick(email);
            }}
            onMouseEnter={() => onMouseEnter?.(email.id)}
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
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onMarkRead={onMarkRead}
          onStar={onStar}
          onArchive={onArchive}
          onDelete={onDelete}
          onProperties={onProperties}
        />
      </ContextMenu.Root>
    );
  },
  (prev, next) =>
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.email.keywords === next.email.keywords &&
    prev.onReply === next.onReply &&
    prev.onReplyAll === next.onReplyAll &&
    prev.onForward === next.onForward &&
    prev.onMarkRead === next.onMarkRead &&
    prev.onArchive === next.onArchive &&
    prev.onDelete === next.onDelete &&
    prev.onProperties === next.onProperties,
);

/* ================================================================
   Shared context menu for message items
   ================================================================ */

function MessageContextMenu({
  email,
  unread,
  flagged,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onStar,
  onArchive,
  onDelete,
  onProperties,
}: {
  email: EmailListItem;
  unread: boolean;
  flagged: boolean;
  onReply?: (email: EmailListItem) => void;
  onReplyAll?: (email: EmailListItem) => void;
  onForward?: (email: EmailListItem) => void;
  onMarkRead?: (emailIds: string[], seen: boolean) => void;
  onStar: (emailId: string, flagged: boolean) => void;
  onArchive?: (emailIds: string[]) => void;
  onDelete?: (emailIds: string[]) => void;
  onProperties?: (email: EmailListItem) => void;
}) {
  const { t } = useTranslation();

  return (
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
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onReply?.(email)}
        >
          {t("action.reply")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onReplyAll?.(email)}
        >
          {t("action.replyAll")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onForward?.(email)}
        >
          {t("action.forward")}
        </ContextMenu.Item>

        <ContextMenu.Separator
          className="my-1"
          style={{ borderTop: "1px solid var(--color-border-primary)" }}
        />

        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onMarkRead?.([email.id], unread)}
        >
          {unread ? t("action.markAsRead") : t("action.markAsUnread")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onStar(email.id, !flagged)}
        >
          {flagged ? t("action.unstar") : t("action.star")}
        </ContextMenu.Item>

        <ContextMenu.Separator
          className="my-1"
          style={{ borderTop: "1px solid var(--color-border-primary)" }}
        />

        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onArchive?.([email.id])}
        >
          {t("action.archive")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-danger)", borderRadius: "var(--radius-sm)" }}
          onSelect={() => onDelete?.([email.id])}
        >
          {t("action.delete")}
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}
