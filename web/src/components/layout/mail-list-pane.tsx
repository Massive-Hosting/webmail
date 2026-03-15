/** Message list pane container - premium toolbar and contextual empty states */

import React, { useCallback } from "react";
import { MessageList } from "@/components/mail/message-list.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import { useSearchStore } from "@/stores/search-store.ts";
import { useMessages } from "@/hooks/use-messages.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useUnreadTitle } from "@/hooks/use-unread-title.ts";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import type { EmailListItem } from "@/types/mail.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { fetchEmail, fetchIdentities } from "@/api/mail.ts";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  CheckCircle,
  FileEdit,
  Trash2,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const { mailboxes, findByRole } = useMailboxes();
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const currentMailbox = mailboxes.find((m) => m.id === selectedMailboxId);
  const mailboxName = currentMailbox?.name ?? "Inbox";

  const {
    emails,
    total,
    threadCounts,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    starEmail,
    markRead,
    moveEmails,
  } = useMessages(selectedMailboxId);

  useUnreadTitle(currentMailbox?.unreadEmails ?? 0, mailboxName);

  const archiveMailbox = findByRole("archive");
  const trashMailbox = findByRole("trash");

  const { open: openCompose } = useCompose();
  const { data: identities } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    staleTime: 5 * 60 * 1000,
  });
  const defaultIdentity = identities?.[0] ?? null;

  // Determine which emails are in the current list
  const displayEmails = searchActive ? searchEmails : emails;

  // Action callbacks for message list context menus
  const handleReply = useCallback(async (emailItem: EmailListItem) => {
    const fullEmail = await fetchEmail(emailItem.id);
    if (fullEmail) openCompose({ mode: "reply", email: fullEmail, identity: defaultIdentity });
  }, [openCompose, defaultIdentity]);

  const handleReplyAll = useCallback(async (emailItem: EmailListItem) => {
    const fullEmail = await fetchEmail(emailItem.id);
    if (fullEmail) openCompose({ mode: "reply-all", email: fullEmail, identity: defaultIdentity });
  }, [openCompose, defaultIdentity]);

  const handleForward = useCallback(async (emailItem: EmailListItem) => {
    const fullEmail = await fetchEmail(emailItem.id);
    if (fullEmail) openCompose({ mode: "forward", email: fullEmail, identity: defaultIdentity });
  }, [openCompose, defaultIdentity]);

  const handleArchive = useCallback((emailIds: string[]) => {
    if (archiveMailbox && selectedMailboxId) {
      moveEmails(emailIds, selectedMailboxId, archiveMailbox.id);
    }
  }, [archiveMailbox, selectedMailboxId, moveEmails]);

  const handleDelete = useCallback((emailIds: string[]) => {
    if (trashMailbox && selectedMailboxId) {
      moveEmails(emailIds, selectedMailboxId, trashMailbox.id);
    }
  }, [trashMailbox, selectedMailboxId, moveEmails]);

  // Decide which data to show
  const displayTotal = searchActive ? searchTotal : total;
  const displayLoading = searchActive ? searchIsLoading : isLoading;
  const displayFetchingNext = searchActive ? searchIsFetchingNextPage : isFetchingNextPage;
  const displayHasNext = searchActive ? searchHasNextPage : hasNextPage;
  const displayFetchNext = searchActive
    ? searchFetchNextPage ?? (() => {})
    : fetchNextPage;

  return (
    <div className="mail-list-pane">
      {/* List toolbar */}
      <div className={`mail-list-pane__toolbar ${searchActive ? "mail-list-pane__toolbar--search" : ""}`}>
        {searchActive ? (
          <>
            <Search size={14} className="mail-list-pane__search-icon" />
            <span className="mail-list-pane__toolbar-title">
              {searchQuery}
            </span>
            {displayTotal > 0 && (
              <span className="mail-list-pane__toolbar-count">
                {t("search.result", { count: displayTotal })}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={clearSearch}
              className="mail-list-pane__close-btn"
              title={t("search.clearSearch")}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <span className="mail-list-pane__toolbar-title">
              {mailboxName}
            </span>
            {total > 0 && (
              <span className="mail-list-pane__toolbar-count">
                {total}
              </span>
            )}
          </>
        )}
      </div>

      {/* Message list */}
      <div className="mail-list-pane__content">
        {searchActive && !displayLoading && displayEmails.length === 0 ? (
          <EmptyState
            icon={<Search size={48} strokeWidth={1} />}
            title={t("search.noMessagesFound")}
            description={t("search.noResultsFor", { query: searchQuery })}
            className="h-full"
          />
        ) : !searchActive && !displayLoading && displayEmails.length === 0 ? (
          <ContextualEmptyState mailboxRole={currentMailbox?.role ?? null} />
        ) : (
          <MessageList
            emails={displayEmails}
            threadCounts={searchActive ? {} : threadCounts}
            isLoading={displayLoading}
            isFetchingNextPage={displayFetchingNext}
            hasNextPage={displayHasNext}
            onFetchNextPage={displayFetchNext}
            onStarEmail={starEmail}
            onReply={handleReply}
            onReplyAll={handleReplyAll}
            onForward={handleForward}
            onMarkRead={markRead}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
});

function ContextualEmptyState({ mailboxRole }: { mailboxRole: string | null }) {
  const { t } = useTranslation();
  switch (mailboxRole) {
    case "inbox":
      return (
        <EmptyState
          icon={<CheckCircle size={48} strokeWidth={1} />}
          title={t("emptyState.allCaughtUp")}
          description={t("emptyState.allCaughtUpDesc")}
          className="h-full"
        />
      );
    case "drafts":
      return (
        <EmptyState
          icon={<FileEdit size={48} strokeWidth={1} />}
          title={t("emptyState.noDrafts")}
          description={t("emptyState.noDraftsDesc")}
          className="h-full"
        />
      );
    case "trash":
      return (
        <EmptyState
          icon={<Trash2 size={48} strokeWidth={1} />}
          title={t("emptyState.trashEmpty")}
          description={t("emptyState.trashEmptyDesc")}
          className="h-full"
        />
      );
    case "junk":
      return (
        <EmptyState
          icon={<AlertTriangle size={48} strokeWidth={1} />}
          title={t("emptyState.noJunk")}
          description={t("emptyState.noJunkDesc")}
          className="h-full"
        />
      );
    default:
      return (
        <EmptyState
          icon={<FolderOpen size={48} strokeWidth={1} />}
          title={t("emptyState.folderEmpty")}
          description={t("emptyState.folderEmptyDesc")}
          className="h-full"
        />
      );
  }
}
