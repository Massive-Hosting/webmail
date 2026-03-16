/** Root application shell with activity bar, three-pane layout, ARIA landmarks, and error states — premium design */

import React, { useEffect, useCallback, useState, lazy, Suspense, useMemo } from "react";
import { AICopilot } from "@/components/mail/ai-copilot.tsx";
import { useAIEnabled } from "@/hooks/use-ai-enabled.ts";
import { Toolbar } from "./toolbar.tsx";
import { Sidebar } from "./sidebar.tsx";
import { ActivityBar } from "./activity-bar.tsx";
import { MailListPane } from "./mail-list-pane.tsx";
import { ReadingPane } from "./reading-pane.tsx";
import { ResizeHandle } from "./resize-handle.tsx";
import { ActionBar } from "@/components/mail/action-bar.tsx";
import { KeyboardShortcutDialog } from "@/components/mail/keyboard-shortcut-dialog.tsx";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { TaskTray } from "@/components/ui/task-tray.tsx";
import { useTasks } from "@/hooks/use-tasks.ts";
import { useUIStore } from "@/stores/ui-store.ts";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { useSearchStore } from "@/stores/search-store.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard.ts";
import { useMessages } from "@/hooks/use-messages.ts";
import { useMessage } from "@/hooks/use-message.ts";
import { useSearch } from "@/hooks/use-search.ts";
import { fetchEmail, fetchIdentities } from "@/api/mail.ts";
import { useQuery } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { WifiOff, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EmailListItem } from "@/types/mail.ts";

// Lazy-loaded heavy components (code splitting)
const ComposeContainer = lazy(() =>
  import("@/components/mail/compose/compose-dialog.tsx").then((m) => ({ default: m.ComposeContainer }))
);
const AdvancedSearchDialog = lazy(() =>
  import("@/components/mail/advanced-search.tsx").then((m) => ({ default: m.AdvancedSearchDialog }))
);
const SettingsDialog = lazy(() =>
  import("@/components/settings/settings-dialog.tsx").then((m) => ({ default: m.SettingsDialog }))
);
const ContactsPage = lazy(() =>
  import("@/components/contacts/contacts-page.tsx").then((m) => ({ default: m.ContactsPage }))
);
const CalendarPage = lazy(() =>
  import("@/components/calendar/calendar-page.tsx").then((m) => ({ default: m.CalendarPage }))
);

export function AppShell() {
  const { t } = useTranslation();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const aiEnabled = useAIEnabled();
  const copilotOpen = useUIStore((s) => s.copilotOpen);
  const toggleCopilot = useUIStore((s) => s.toggleCopilot);
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen);

  const handleToggleCopilot = useCallback(() => {
    toggleCopilot();
  }, [toggleCopilot]);

  const handleCloseCopilot = useCallback(() => {
    setCopilotOpen(false);
  }, [setCopilotOpen]);

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const readingPaneVisible = useUIStore((s) => s.readingPaneVisible);
  const messageListWidth = useUIStore((s) => s.messageListWidth);
  const isMobile = useUIStore((s) => s.isMobile);
  const mobileView = useUIStore((s) => s.mobileView);
  const activeView = useUIStore((s) => s.activeView);
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const selectedEmailIds = useUIStore((s) => s.selectedEmailIds);

  const setMessageListWidth = useUIStore((s) => s.setMessageListWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const setSelectedMailbox = useUIStore((s) => s.setSelectedMailbox);
  const setSelectedEmail = useUIStore((s) => s.setSelectedEmail);
  const toggleEmailSelection = useUIStore((s) => s.toggleEmailSelection);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const setIsMobile = useUIStore((s) => s.setIsMobile);
  const setMobileView = useUIStore((s) => s.setMobileView);
  const resetLayout = useUIStore((s) => s.resetLayout);

  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcuts);

  const isSearchActive = useSearchStore((s) => s.isSearchActive);
  const searchQuery = useSearchStore((s) => s.query);
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const virtualFolder = useUIStore((s) => s.virtualFolder);

  const { findByRole, sortedMailboxes, mailboxes } = useMailboxes();

  // Virtual folder filter for scheduled/snoozed views (memoized for stable reference)
  const virtualFilter = useMemo(() => {
    if (!virtualFolder) return undefined;
    return { hasKeyword: virtualFolder === "scheduled" ? "$scheduled" : "$snoozed" };
  }, [virtualFolder]);
  const effectiveMailboxId = virtualFolder ? null : selectedMailboxId;

  const { emails, starEmail, markRead, moveEmails, destroyEmails } = useMessages(effectiveMailboxId, virtualFilter);
  const { email: selectedEmail } = useMessage(selectedEmailId);
  const { open: openCompose } = useCompose();
  const { bulkThreshold, startBulkMove, startBulkDelete, startBulkMarkRead } = useTasks();

  // Search results
  const search = useSearch();

  // Fetch identities for compose
  const { data: identities } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    staleTime: 5 * 60 * 1000,
  });

  const defaultIdentity = identities?.[0] ?? null;

  // Auto-select inbox on first load (but not when a virtual folder is active)
  useEffect(() => {
    if (!selectedMailboxId && !virtualFolder && sortedMailboxes.length > 0) {
      const inbox = findByRole("inbox");
      if (inbox) {
        setSelectedMailbox(inbox.id);
      } else if (sortedMailboxes[0]) {
        setSelectedMailbox(sortedMailboxes[0].id);
      }
    }
  }, [selectedMailboxId, sortedMailboxes, findByRole, setSelectedMailbox]);

  // Responsive breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [setIsMobile]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success(t("toast.backOnline"), { duration: 3000 });
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Pick the active email list (search results or mailbox)
  const activeEmails = isSearchActive ? search.emails : emails;

  // Find current email index in list
  const currentIndex = activeEmails.findIndex((e) => e.id === selectedEmailId);

  const handleGoToMailbox = useCallback(
    (role: string) => {
      const mailbox = findByRole(role as "inbox" | "sent" | "drafts" | "trash");
      if (mailbox) {
        clearSearch();
        setSelectedMailbox(mailbox.id);
      }
    },
    [findByRole, setSelectedMailbox, clearSearch],
  );

  // Keyboard shortcuts (conditionally enabled)
  useKeyboardShortcuts(
    keyboardShortcutsEnabled
      ? {
          onNavigateDown: () => {
            if (currentIndex < activeEmails.length - 1) {
              const next = activeEmails[currentIndex + 1];
              setSelectedEmail(next.id, next.threadId);
            }
          },
          onNavigateUp: () => {
            if (currentIndex > 0) {
              const prev = activeEmails[currentIndex - 1];
              setSelectedEmail(prev.id, prev.threadId);
            }
          },
          onOpen: () => {
            if (selectedEmailId && isMobile) {
              setMobileView("message");
            }
          },
          onEscape: () => {
            if (isSearchActive) {
              clearSearch();
            } else if (isMobile && mobileView === "message") {
              setMobileView("list");
            } else {
              clearSelection();
            }
          },
          onToggleSelect: () => {
            if (selectedEmailId) {
              toggleEmailSelection(selectedEmailId);
            }
          },
          onStar: () => {
            if (selectedEmailId) {
              const email = activeEmails.find((e) => e.id === selectedEmailId);
              if (email) {
                starEmail(selectedEmailId, !email.keywords["$flagged"]);
              }
            }
          },
          onMarkRead: () => {
            if (selectedEmailId) {
              markRead([selectedEmailId], true);
            }
          },
          onMarkUnread: () => {
            if (selectedEmailId) {
              markRead([selectedEmailId], false);
            }
          },
          onArchive: () => {
            if (selectedEmailId && selectedMailboxId) {
              const archive = findByRole("archive");
              if (archive) {
                moveEmails([selectedEmailId], selectedMailboxId, archive.id);
              }
            }
          },
          onDelete: () => {
            if (selectedEmailId && selectedMailboxId) {
              const trash = findByRole("trash");
              if (trash) {
                moveEmails([selectedEmailId], selectedMailboxId, trash.id);
              }
            }
          },
          onCompose: () => {
            openCompose({
              mode: "new",
              identity: defaultIdentity,
            });
          },
          onReply: () => {
            if (selectedEmail) {
              openCompose({
                mode: "reply",
                email: selectedEmail,
                identity: defaultIdentity,
              });
            }
          },
          onReplyAll: () => {
            if (selectedEmail) {
              openCompose({
                mode: "reply-all",
                email: selectedEmail,
                identity: defaultIdentity,
              });
            }
          },
          onForward: () => {
            if (selectedEmail) {
              openCompose({
                mode: "forward",
                email: selectedEmail,
                identity: defaultIdentity,
              });
            }
          },
          onSearch: () => {
            document.getElementById("search-input")?.focus();
          },
          onHelp: () => {
            setShowShortcuts(true);
          },
          onGoToMailbox: handleGoToMailbox,
        }
      : {},
  );

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleOpenAdvancedSearch = useCallback(() => {
    setShowAdvancedSearch(true);
  }, []);

  // Action bar callbacks
  const currentMailbox = mailboxes.find((m) => m.id === selectedMailboxId);
  const archiveMailbox = findByRole("archive");
  const trashMailbox = findByRole("trash");
  const junkMailbox = findByRole("junk");

  const displayEmails = isSearchActive ? search.emails : emails;

  const selectedEmails = useMemo(() => {
    if (selectedEmailIds.size === 0) return [];
    return displayEmails.filter((e) => selectedEmailIds.has(e.id));
  }, [displayEmails, selectedEmailIds]);

  const hasReadingPaneMessage = !!selectedEmailId && selectedEmailIds.size === 1;

  const handleNewMail = useCallback(() => {
    openCompose({ mode: "new", identity: defaultIdentity });
  }, [openCompose, defaultIdentity]);

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

  const handleArchive = useCallback(async (emailIds: string[]) => {
    if (archiveMailbox && selectedMailboxId) {
      if (emailIds.length > bulkThreshold) {
        await startBulkMove(emailIds, selectedMailboxId, archiveMailbox.id);
      } else {
        moveEmails(emailIds, selectedMailboxId, archiveMailbox.id);
      }
    }
  }, [archiveMailbox, selectedMailboxId, moveEmails, bulkThreshold, startBulkMove]);

  const handleDelete = useCallback(async (emailIds: string[]) => {
    if (currentMailbox?.role === "trash") {
      // Already in trash — permanently destroy
      if (emailIds.length > bulkThreshold) {
        await startBulkDelete(emailIds);
      } else {
        destroyEmails(emailIds);
      }
    } else if (trashMailbox && selectedMailboxId) {
      // Move to trash
      if (emailIds.length > bulkThreshold) {
        await startBulkDelete(emailIds);
      } else {
        moveEmails(emailIds, selectedMailboxId, trashMailbox.id);
      }
    }
  }, [currentMailbox, trashMailbox, selectedMailboxId, moveEmails, destroyEmails, bulkThreshold, startBulkDelete]);

  const handleJunk = useCallback(async (emailIds: string[]) => {
    if (junkMailbox && selectedMailboxId) {
      if (emailIds.length > bulkThreshold) {
        await startBulkMove(emailIds, selectedMailboxId, junkMailbox.id);
      } else {
        moveEmails(emailIds, selectedMailboxId, junkMailbox.id);
      }
    }
  }, [junkMailbox, selectedMailboxId, moveEmails, bulkThreshold, startBulkMove]);

  const handleMoveToFolder = useCallback(async (emailIds: string[], targetMailboxId: string) => {
    if (selectedMailboxId) {
      if (emailIds.length > bulkThreshold) {
        await startBulkMove(emailIds, selectedMailboxId, targetMailboxId);
      } else {
        moveEmails(emailIds, selectedMailboxId, targetMailboxId);
      }
    }
  }, [selectedMailboxId, moveEmails, bulkThreshold, startBulkMove]);

  // Shared content
  const toasterConfig = (
    <Toaster
      position={isMobile ? "bottom-center" : "bottom-right"}
      toastOptions={{
        style: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border-primary)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          fontSize: "13px",
        },
      }}
    />
  );

  const offlineBanner = isOffline && (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <WifiOff size={14} className="inline mr-2 align-text-bottom" />
      {t("toast.offline")}
    </div>
  );

  const sharedDialogs = (
    <>
      <Suspense fallback={<div />}>
        <ComposeContainer />
      </Suspense>
      {showShortcuts && (
        <KeyboardShortcutDialog onClose={() => setShowShortcuts(false)} />
      )}
      {showAdvancedSearch && (
        <Suspense fallback={<div />}>
          <AdvancedSearchDialog
            open={showAdvancedSearch}
            onOpenChange={setShowAdvancedSearch}
          />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={<div />}>
          <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
        </Suspense>
      )}
    </>
  );

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-dvh" style={{ backgroundColor: "var(--color-bg-primary)" }}>
        {offlineBanner}
        <a href="#main-content" className="skip-nav">
          {t("nav.skipToContent")}
        </a>
        <header role="banner">
          <Toolbar
            onSettings={handleOpenSettings}
            onAdvancedSearch={handleOpenAdvancedSearch}
            aiEnabled={aiEnabled}
            copilotOpen={copilotOpen}
            onToggleCopilot={handleToggleCopilot}
          />
        </header>
        {mobileView === "sidebar" && (
          <nav role="navigation" aria-label={t("folder.mailFolders")}>
            <Sidebar />
          </nav>
        )}
        <main id="main-content" role="main" className="flex-1 overflow-hidden">
          {mobileView === "list" && (
            <MailListPane
              searchActive={isSearchActive}
              searchQuery={searchQuery}
              searchEmails={search.emails}
              searchTotal={search.total}
              searchIsLoading={search.isLoading}
              searchIsFetchingNextPage={search.isFetchingNextPage}
              searchHasNextPage={search.hasNextPage}
              searchFetchNextPage={search.fetchNextPage}
            />
          )}
          {mobileView === "message" && (
            <div className="flex flex-col h-full">
              <button
                onClick={() => setMobileView("list")}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
                style={{
                  color: "var(--color-text-accent)",
                  borderBottom: "1px solid var(--color-border-primary)",
                }}
              >
                <ArrowLeft size={15} />
                {t("nav.backToList")}
              </button>
              <div className="flex-1 overflow-hidden">
                <ReadingPane />
              </div>
            </div>
          )}
        </main>
        <TaskTray />
        {toasterConfig}
        {sharedDialogs}
        <div role="status" aria-live="polite" className="sr-only" />
      </div>
    );
  }

  // Desktop layout with activity bar
  return (
    <div className="flex flex-col h-dvh" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      {offlineBanner}
      <a href="#main-content" className="skip-nav">
        {t("nav.skipToContent")}
      </a>
      <header role="banner">
        <Toolbar
          onSettings={handleOpenSettings}
          onAdvancedSearch={handleOpenAdvancedSearch}
        />
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Activity bar (icon rail) */}
        <ActivityBar />

        {/* Sidebar (folder tree — only visible for mail view) */}
        <nav role="navigation" aria-label={t("folder.mailFolders")}>
          <Sidebar />
        </nav>

        {/* Sidebar resize handle */}
        {!sidebarCollapsed && activeView === "mail" && (
          <ResizeHandle
            onResize={(delta) => setSidebarWidth(useUIStore.getState().sidebarWidth + delta)}
            onDoubleClick={resetLayout}
          />
        )}

        {/* Contacts view */}
        {activeView === "contacts" && (
          <main id="main-content" role="main" className="flex-1 overflow-hidden">
            <Suspense fallback={<div />}>
              <ContactsPage />
            </Suspense>
          </main>
        )}

        {/* Calendar view */}
        {activeView === "calendar" && (
          <main id="main-content" role="main" className="flex-1 overflow-hidden">
            <Suspense fallback={<div />}>
              <CalendarPage />
            </Suspense>
          </main>
        )}

        {/* Mail view */}
        {activeView === "mail" && (
          <>
          <main id="main-content" role="main" className="flex flex-col flex-1 overflow-hidden">
            {/* Action bar — spans full content width */}
            <ActionBar
              selectedEmailIds={selectedEmailIds}
              selectedEmails={selectedEmails}
              hasReadingPaneMessage={hasReadingPaneMessage}
              currentMailboxId={selectedMailboxId}
              currentMailboxRole={currentMailbox?.role ?? null}
              mailboxes={sortedMailboxes}
              virtualFolder={virtualFolder}
              onNewMail={handleNewMail}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onMoveToFolder={handleMoveToFolder}
              onJunk={handleJunk}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onMarkRead={markRead}
              onStar={starEmail}
            />

            {/* Message list + Reading pane row */}
            <div className="flex flex-1 overflow-hidden">
              {/* Message list */}
              <div
                className="shrink-0 overflow-hidden"
                style={{
                  width: readingPaneVisible ? messageListWidth : undefined,
                  flex: readingPaneVisible ? undefined : 1,
                }}
              >
                <MailListPane
                  searchActive={isSearchActive}
                  searchQuery={searchQuery}
                  searchEmails={search.emails}
                  searchTotal={search.total}
                  searchIsLoading={search.isLoading}
                  searchIsFetchingNextPage={search.isFetchingNextPage}
                  searchHasNextPage={search.hasNextPage}
                  searchFetchNextPage={search.fetchNextPage}
                />
              </div>

              {/* Message list / reading pane resize handle */}
              {readingPaneVisible && (
                <ResizeHandle
                  onResize={(delta) =>
                    setMessageListWidth(useUIStore.getState().messageListWidth + delta)
                  }
                  onDoubleClick={resetLayout}
                />
              )}

              {/* Reading pane */}
              {readingPaneVisible && (
                <aside
                  className="flex-1 overflow-hidden"
                  role="complementary"
                  aria-label={t("readingPane.messagePreview")}
                  style={{ backgroundColor: "var(--color-bg-primary)" }}
                >
                  <ReadingPane />
                </aside>
              )}
            </div>
          </main>

          {/* AI Copilot panel */}
          {aiEnabled && (
            <AICopilot
              open={copilotOpen}
              onClose={handleCloseCopilot}
            />
          )}
          </>
        )}
      </div>

      <TaskTray />
      {toasterConfig}
      {sharedDialogs}
      <div role="status" aria-live="polite" className="sr-only" />
    </div>
  );
}
