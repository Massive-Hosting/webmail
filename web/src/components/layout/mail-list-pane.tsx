/** Message list pane container - premium toolbar and contextual empty states */

import React, { useCallback, useState, useMemo } from "react";
import { MessageList } from "@/components/mail/message-list.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import { useSearchStore } from "@/stores/search-store.ts";
import { useMessages } from "@/hooks/use-messages.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useUnreadTitle } from "@/hooks/use-unread-title.ts";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import type { EmailListItem } from "@/types/mail.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { EmailPropertiesDialog } from "@/components/mail/email-properties-dialog.tsx";
import { useMessage } from "@/hooks/use-message.ts";
import { fetchEmail, fetchIdentities } from "@/api/mail.ts";
import { printEmail } from "@/lib/print.ts";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  CheckCircle,
  FileEdit,
  Trash2,
  AlertTriangle,
  FolderOpen,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Layers,
  List,
  Clock,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store.ts";

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
  const virtualFolder = useUIStore((s) => s.virtualFolder);
  const sortNewestFirst = useUIStore((s) => s.sortNewestFirst);
  const toggleSort = useUIStore((s) => s.toggleSort);
  const conversationView = useSettingsStore((s) => s.conversationView);
  const setConversationView = useSettingsStore((s) => s.setConversationView);
  const { mailboxes, findByRole } = useMailboxes();
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const handleToggleConversation = useCallback(() => {
    setConversationView(!conversationView);
  }, [conversationView, setConversationView]);

  const currentMailbox = mailboxes.find((m) => m.id === selectedMailboxId);

  const mailboxName = virtualFolder
    ? (virtualFolder === "scheduled" ? t("folder.scheduled") : t("folder.snoozed"))
    : (currentMailbox?.name ?? "Inbox");

  // Use a stable filter for virtual folders to avoid reference instability
  const virtualFilter = useMemo(() => {
    if (!virtualFolder) return undefined;
    return { hasKeyword: virtualFolder === "scheduled" ? "$scheduled" : "$snoozed" };
  }, [virtualFolder]);
  const effectiveMailboxId = virtualFolder ? null : selectedMailboxId;

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
  } = useMessages(effectiveMailboxId, virtualFilter);

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

  // Properties dialog state
  const [propertiesEmailId, setPropertiesEmailId] = useState<string | null>(null);
  const { email: propertiesEmail } = useMessage(propertiesEmailId);

  const handleProperties = useCallback((emailItem: EmailListItem) => {
    setPropertiesEmailId(emailItem.id);
  }, []);

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

  const handlePrint = useCallback(async (emailItem: EmailListItem) => {
    const fullEmail = await fetchEmail(emailItem.id);
    if (fullEmail) printEmail(fullEmail);
  }, []);

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
            <div className="flex-1" />
            <Tooltip.Provider delayDuration={400}>
              <div className="mail-list-pane__toolbar-actions">
                <div className="mail-list-pane__toolbar-separator" />
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={toggleSort}
                      className="mail-list-pane__toolbar-icon-btn"
                      aria-label={sortNewestFirst ? t("listToolbar.newestFirst") : t("listToolbar.oldestFirst")}
                    >
                      {sortNewestFirst
                        ? <ArrowDownWideNarrow size={16} />
                        : <ArrowUpNarrowWide size={16} />
                      }
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    className="mail-list-pane__tooltip"
                    sideOffset={6}
                  >
                    {sortNewestFirst ? t("listToolbar.newestFirst") : t("listToolbar.oldestFirst")}
                  </Tooltip.Content>
                </Tooltip.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={handleToggleConversation}
                      className={`mail-list-pane__toolbar-icon-btn ${conversationView ? "mail-list-pane__toolbar-icon-btn--active" : ""}`}
                      aria-label={conversationView ? t("listToolbar.groupByConversation") : t("listToolbar.showIndividual")}
                    >
                      {conversationView ? <Layers size={16} /> : <List size={16} />}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    className="mail-list-pane__tooltip"
                    sideOffset={6}
                  >
                    {conversationView ? t("listToolbar.groupByConversation") : t("listToolbar.showIndividual")}
                  </Tooltip.Content>
                </Tooltip.Root>
              </div>
            </Tooltip.Provider>
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
          <ContextualEmptyState mailboxRole={currentMailbox?.role ?? null} virtualFolder={virtualFolder} />
        ) : (
          <MessageList
            emails={displayEmails}
            threadCounts={searchActive || !conversationView ? {} : threadCounts}
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
            onProperties={handleProperties}
            onPrint={handlePrint}
          />
        )}
      </div>

      {/* Email properties dialog */}
      {propertiesEmailId && propertiesEmail && (
        <EmailPropertiesDialog
          email={propertiesEmail}
          onClose={() => setPropertiesEmailId(null)}
        />
      )}
    </div>
  );
});

function ContextualEmptyState({ mailboxRole, virtualFolder }: { mailboxRole: string | null; virtualFolder?: string | null }) {
  const { t } = useTranslation();

  if (virtualFolder === "scheduled") {
    return (
      <EmptyState
        icon={<Clock size={48} strokeWidth={1} />}
        title={t("folder.scheduled")}
        description={t("emptyState.folderEmptyDesc")}
        className="h-full"
      />
    );
  }
  if (virtualFolder === "snoozed") {
    return (
      <EmptyState
        icon={<Clock size={48} strokeWidth={1} />}
        title={t("folder.snoozed")}
        description={t("emptyState.folderEmptyDesc")}
        className="h-full"
      />
    );
  }

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
