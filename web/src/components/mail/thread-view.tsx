/** Thread view - stacked messages with expand/collapse and visual connectors */

import React, { useState, useMemo } from "react";
import { useThread } from "@/hooks/use-thread.ts";
import { MessageView } from "./message-view.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatMessageDate, formatAddress } from "@/lib/format.ts";
import { isUnread } from "@/types/mail.ts";
import type { Email } from "@/types/mail.ts";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

interface ThreadViewProps {
  threadId: string;
  activeEmailId: string;
}

export const ThreadView = React.memo(function ThreadView({
  threadId,
  activeEmailId,
}: ThreadViewProps) {
  const { thread, emails, isLoading } = useThread(threadId);

  if (isLoading) {
    return <ThreadSkeleton />;
  }

  if (!thread || emails.length === 0) {
    return null;
  }

  // Single message - no thread UI needed
  if (emails.length === 1) {
    return <MessageView emailId={emails[0].id} email={emails[0]} />;
  }

  return <ThreadContent emails={emails} activeEmailId={activeEmailId} />;
});

function ThreadContent({
  emails,
  activeEmailId,
}: {
  emails: Email[];
  activeEmailId: string;
}) {
  // Expand most recent + unread messages by default
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    // Always expand the most recent
    if (emails.length > 0) {
      initial.add(emails[emails.length - 1].id);
    }
    // Also expand unread messages
    for (const email of emails) {
      if (isUnread(email)) {
        initial.add(email.id);
      }
    }
    return initial;
  });

  const [allExpanded, setAllExpanded] = useState(false);

  const toggleEmail = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set([emails[emails.length - 1].id]));
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(emails.map((e) => e.id)));
      setAllExpanded(true);
    }
  };

  const subject = emails[0]?.subject || "(no subject)";

  return (
    <div className="thread-view">
      {/* Thread header */}
      <div className="thread-view__header">
        <div className="thread-view__header-content">
          <h2 className="thread-view__subject">
            {subject}
          </h2>
          <div className="thread-view__meta">
            <MessageSquare size={14} />
            <span>{emails.length} messages in this conversation</span>
          </div>
        </div>
        <button
          onClick={toggleAll}
          className="thread-view__expand-all-btn"
        >
          {allExpanded ? (
            <>
              <ChevronUp size={14} />
              Collapse all
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Expand all
            </>
          )}
        </button>
      </div>

      {/* Thread messages with visual connector */}
      <div className="thread-view__messages">
        {emails.map((email, index) => {
          const isExpanded = expandedIds.has(email.id);
          const isLast = index === emails.length - 1;
          return (
            <div key={email.id} className="thread-view__message-wrapper">
              {/* Visual thread line */}
              {!isLast && (
                <div className="thread-view__connector" />
              )}
              <ThreadMessage
                email={email}
                isExpanded={isExpanded}
                onToggle={() => toggleEmail(email.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ThreadMessage = React.memo(function ThreadMessage({
  email,
  isExpanded,
  onToggle,
}: {
  email: Email;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sender = email.from?.[0] ?? { name: null, email: "unknown" };
  const unread = isUnread(email);

  if (!isExpanded) {
    // Collapsed card
    return (
      <button
        onClick={onToggle}
        className={`thread-view__collapsed ${unread ? "thread-view__collapsed--unread" : ""}`}
      >
        <div className="thread-view__collapsed-dot">
          {unread && <div className="thread-view__unread-dot" />}
        </div>
        <Avatar address={sender} size={28} />
        <span className={`thread-view__collapsed-sender ${unread ? "font-medium" : ""}`}>
          {formatAddress(sender)}
        </span>
        <span className="thread-view__collapsed-preview">
          {email.preview}
        </span>
        <span className="thread-view__collapsed-date">
          {formatMessageDate(email.receivedAt)}
        </span>
        <ChevronDown size={14} className="thread-view__collapsed-chevron" />
      </button>
    );
  }

  // Expanded state
  return (
    <div className="thread-view__expanded">
      <button
        onClick={onToggle}
        className="thread-view__collapse-handle"
      >
        <ChevronUp size={12} />
        <span>Collapse</span>
      </button>
      <MessageView emailId={email.id} email={email} />
    </div>
  );
});

function ThreadSkeleton() {
  return (
    <div className="thread-view thread-view--skeleton">
      <div className="thread-view__header">
        <div>
          <Skeleton width="60%" height={24} className="mb-2" />
          <Skeleton width={140} height={14} />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="thread-view__skeleton-row">
          <Skeleton width={28} height={28} rounded />
          <Skeleton width={120} height={14} />
          <div className="flex-1" />
          <Skeleton width={60} height={12} />
        </div>
      ))}
    </div>
  );
}
