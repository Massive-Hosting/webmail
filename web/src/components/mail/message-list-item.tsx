/** Single message list row - premium design with smooth transitions */

import React, { useCallback } from "react";
import type { EmailListItem } from "@/types/mail.ts";
import { isUnread, isFlagged } from "@/types/mail.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { formatMessageDate, formatAddress } from "@/lib/format.ts";
import { Star, Paperclip } from "lucide-react";

interface MessageListItemProps {
  email: EmailListItem;
  isSelected: boolean;
  isMultiSelected: boolean;
  onClick: (email: EmailListItem, event: React.MouseEvent) => void;
  onStar: (emailId: string, flagged: boolean) => void;
  onMouseEnter?: (emailId: string) => void;
}

export const MessageListItem = React.memo(
  function MessageListItem({
    email,
    isSelected,
    isMultiSelected,
    onClick,
    onStar,
    onMouseEnter,
  }: MessageListItemProps) {
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
      <div
        className="message-list-item group"
        data-selected={active || undefined}
        data-unread={unread || undefined}
        role="option"
        aria-selected={isSelected}
        onClick={(e) => onClick(email, e)}
        onMouseEnter={() => onMouseEnter?.(email.id)}
      >
        {/* Unread indicator - small indigo dot */}
        <div className="message-list-item__indicator">
          {unread && (
            <div className="message-list-item__unread-dot" />
          )}
        </div>

        {/* Avatar with subtle shadow */}
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
            {email.subject || "(no subject)"}
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
            aria-label={flagged ? "Remove star" : "Add star"}
          >
            <Star
              size={15}
              fill={flagged ? "currentColor" : "none"}
              strokeWidth={flagged ? 0 : 1.5}
            />
          </button>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isMultiSelected === next.isMultiSelected &&
    prev.email.keywords === next.email.keywords,
);
