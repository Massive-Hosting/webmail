/** Message list pane container */

import React from "react";
import { MessageList } from "@/components/mail/message-list.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import { useSearchStore } from "@/stores/search-store.ts";
import { useMessages } from "@/hooks/use-messages.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useUnreadTitle } from "@/hooks/use-unread-title.ts";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import type { EmailListItem } from "@/types/mail.ts";
import {
  Archive,
  Trash2,
  MailOpen,
  MailX,
  Search,
  X,
  Inbox,
  FileEdit,
  CheckCircle,
  FolderOpen,
  AlertTriangle,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

interface MailListPaneProps {
  searchActive?: boolean;
  searchQuery?: string;
  searchEmails?: EmailListItem[];
  searchTotal?: number;
  searchIsLoading?: boolean;
  searchIsFetchingNextPage?: boolean;
  searchHasNextPage?: boolean;
  searchFetchNextPage?: () => void;
}

export const MailListPane = React.memo(function MailListPane({
  searchActive = false,
  searchQuery = "",
  searchEmails = [],
  searchTotal = 0,
  searchIsLoading = false,
  searchIsFetchingNextPage = false,
  searchHasNextPage = false,
  searchFetchNextPage,
}: MailListPaneProps) {
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const selectedEmailIds = useUIStore((s) => s.selectedEmailIds);
  const { mailboxes, findByRole } = useMailboxes();
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const currentMailbox = mailboxes.find((m) => m.id === selectedMailboxId);
  const mailboxName = currentMailbox?.name ?? "Inbox";

  const {
    emails,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    starEmail,
    markRead,
    moveEmails,
  } = useMessages(selectedMailboxId);

  useUnreadTitle(currentMailbox?.unreadEmails ?? 0, mailboxName);

  const hasSelection = selectedEmailIds.size > 1;
  const archiveMailbox = findByRole("archive");
  const trashMailbox = findByRole("trash");

  // Decide which data to show
  const displayEmails = searchActive ? searchEmails : emails;
  const displayTotal = searchActive ? searchTotal : total;
  const displayLoading = searchActive ? searchIsLoading : isLoading;
  const displayFetchingNext = searchActive ? searchIsFetchingNextPage : isFetchingNextPage;
  const displayHasNext = searchActive ? searchHasNextPage : hasNextPage;
  const displayFetchNext = searchActive
    ? searchFetchNextPage ?? (() => {})
    : fetchNextPage;

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* List toolbar */}
        <div
          className="flex items-center gap-2 px-3 h-10 shrink-0"
          style={{
            borderBottom: "1px solid var(--color-border-primary)",
            backgroundColor: searchActive
              ? "var(--color-bg-secondary)"
              : "var(--color-bg-primary)",
          }}
        >
          {searchActive ? (
            <>
              <Search
                size={14}
                style={{ color: "var(--color-text-accent)" }}
              />
              <span
                className="text-sm font-medium truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                Search results for: {searchQuery}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {displayTotal > 0
                  ? `${displayTotal} result${displayTotal !== 1 ? "s" : ""}`
                  : ""}
              </span>
              <div className="flex-1" />
              <button
                onClick={clearSearch}
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                title="Clear search"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <span
                className="text-sm font-medium truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {mailboxName}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {total > 0 && `${total} messages`}
              </span>

              <div className="flex-1" />

              {/* Batch action buttons (visible when multi-selected) */}
              {hasSelection && (
                <div className="flex items-center gap-1">
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => {
                          if (archiveMailbox && selectedMailboxId) {
                            moveEmails(
                              Array.from(selectedEmailIds),
                              selectedMailboxId,
                              archiveMailbox.id,
                            );
                          }
                        }}
                        className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <Archive size={16} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--color-bg-elevated)", boxShadow: "var(--shadow-md)", border: "1px solid var(--color-border-primary)" }} sideOffset={5}>
                      Archive
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => {
                          if (trashMailbox && selectedMailboxId) {
                            moveEmails(
                              Array.from(selectedEmailIds),
                              selectedMailboxId,
                              trashMailbox.id,
                            );
                          }
                        }}
                        className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--color-bg-elevated)", boxShadow: "var(--shadow-md)", border: "1px solid var(--color-border-primary)" }} sideOffset={5}>
                      Delete
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => markRead(Array.from(selectedEmailIds), true)}
                        className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <MailOpen size={16} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--color-bg-elevated)", boxShadow: "var(--shadow-md)", border: "1px solid var(--color-border-primary)" }} sideOffset={5}>
                      Mark read
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => markRead(Array.from(selectedEmailIds), false)}
                        className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <MailX size={16} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--color-bg-elevated)", boxShadow: "var(--shadow-md)", border: "1px solid var(--color-border-primary)" }} sideOffset={5}>
                      Mark unread
                    </Tooltip.Content>
                  </Tooltip.Root>

                  <span className="text-xs ml-1" style={{ color: "var(--color-text-tertiary)" }}>
                    {selectedEmailIds.size} selected
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-hidden">
          {searchActive && !displayLoading && displayEmails.length === 0 ? (
            <EmptyState
              icon={<Search size={48} strokeWidth={1.5} />}
              title="No messages found"
              description={`No results for "${searchQuery}". Try different keywords or use search operators like from:, to:, subject:, has:attachment.`}
              className="h-full"
            />
          ) : !searchActive && !displayLoading && displayEmails.length === 0 ? (
            <ContextualEmptyState mailboxRole={currentMailbox?.role ?? null} />
          ) : (
            <MessageList
              emails={displayEmails}
              isLoading={displayLoading}
              isFetchingNextPage={displayFetchingNext}
              hasNextPage={displayHasNext}
              onFetchNextPage={displayFetchNext}
              onStarEmail={starEmail}
            />
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
});

function ContextualEmptyState({ mailboxRole }: { mailboxRole: string | null }) {
  switch (mailboxRole) {
    case "inbox":
      return (
        <EmptyState
          icon={<CheckCircle size={48} strokeWidth={1.5} />}
          title="All caught up!"
          description="No new messages in your inbox. Take a break or compose something new."
          className="h-full"
        />
      );
    case "drafts":
      return (
        <EmptyState
          icon={<FileEdit size={48} strokeWidth={1.5} />}
          title="No drafts"
          description="Messages you're composing will be saved here automatically."
          className="h-full"
        />
      );
    case "trash":
      return (
        <EmptyState
          icon={<Trash2 size={48} strokeWidth={1.5} />}
          title="Trash is empty"
          description="Messages you delete will appear here for 30 days before permanent removal."
          className="h-full"
        />
      );
    case "junk":
      return (
        <EmptyState
          icon={<AlertTriangle size={48} strokeWidth={1.5} />}
          title="No junk mail"
          description="Messages detected as spam will appear here."
          className="h-full"
        />
      );
    default:
      return (
        <EmptyState
          icon={<FolderOpen size={48} strokeWidth={1.5} />}
          title="This folder is empty"
          description="Messages moved to this folder will show up here."
          className="h-full"
        />
      );
  }
}
