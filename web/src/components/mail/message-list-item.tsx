/** Single message list row - 72px fixed height */

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

    let bgColor = "transparent";
    if (isSelected || isMultiSelected) {
      bgColor = "var(--color-message-selected)";
    } else if (unread) {
      bgColor = "var(--color-message-unread)";
    }

    return (
      <div
        className="flex items-center gap-3 px-3 cursor-pointer transition-colors duration-100 group"
        style={{ backgroundColor: bgColor, height: "var(--density-row-height)" }}
        role="option"
        aria-selected={isSelected}
        onClick={(e) => onClick(email, e)}
        onMouseEnter={() => onMouseEnter?.(email.id)}
        onMouseOver={(e) => {
          if (!isSelected && !isMultiSelected && !unread) {
            e.currentTarget.style.backgroundColor = "var(--color-message-hover)";
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = bgColor;
        }}
      >
        {/* Unread dot */}
        <div className="w-2 shrink-0 flex justify-center">
          {unread && (
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-bg-accent)" }}
            />
          )}
        </div>

        {/* Avatar */}
        <Avatar address={sender} size={36} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Top row: sender + date */}
          <div className="flex items-center gap-2">
            <span
              className={`text-sm truncate flex-1 ${unread ? "font-semibold" : ""}`}
              style={{ color: "var(--color-text-primary)" }}
            >
              {formatAddress(sender)}
            </span>
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {formatMessageDate(email.receivedAt)}
            </span>
          </div>

          {/* Subject */}
          <div
            className={`text-sm truncate ${unread ? "font-semibold" : ""}`}
            style={{ color: "var(--color-text-primary)" }}
          >
            {email.subject || "(no subject)"}
          </div>

          {/* Preview */}
          <div
            className="text-xs truncate"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {email.preview}
          </div>
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1 shrink-0">
          {email.hasAttachment && (
            <Paperclip
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
            />
          )}
          <button
            onClick={handleStarClick}
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
            aria-label={flagged ? "Remove star" : "Add star"}
          >
            <Star
              size={16}
              fill={flagged ? "#f59e0b" : "none"}
              style={{
                color: flagged ? "#f59e0b" : "var(--color-text-tertiary)",
              }}
              className={`${flagged ? "star-bounce" : "opacity-0 group-hover:opacity-100 transition-opacity"}`}
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
