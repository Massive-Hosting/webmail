/** Reading pane container - shows message, thread, or compose view */

import React, { lazy, Suspense, useEffect, useRef } from "react";
import { useUIStore } from "@/stores/ui-store.ts";
import { useComposeStore } from "@/stores/compose-store.ts";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { MessageView } from "@/components/mail/message-view.tsx";
import { ThreadView } from "@/components/mail/thread-view.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { Mail } from "lucide-react";
import { updateEmails } from "@/api/mail.ts";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useMessage } from "@/hooks/use-message.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

const ComposePanel = lazy(() =>
  import("@/components/mail/compose/compose-dialog.tsx").then((m) => ({ default: m.ComposePanel }))
);

export const ReadingPane = React.memo(function ReadingPane() {
  const { t } = useTranslation();
  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const selectedThreadId = useUIStore((s) => s.selectedThreadId);
  const activeDraftId = useComposeStore((s) => s.activeDraftId);
  const activeDraft = useComposeStore((s) =>
    s.activeDraftId ? s.drafts.get(s.activeDraftId) : undefined,
  );

  // Show inline compose if active draft is in inline mode
  if (activeDraftId && activeDraft?.windowMode === "inline") {
    return (
      <Suspense fallback={<ComposeSkeleton />}>
        <ComposePanel draftId={activeDraftId} />
      </Suspense>
    );
  }

  if (!selectedEmailId) {
    return (
      <div className="reading-pane reading-pane--empty">
        <EmptyState
          icon={
            <div className="reading-pane__empty-icon-wrapper">
              <Mail size={40} strokeWidth={1} />
            </div>
          }
          title={t("readingPane.selectMessage")}
          description={t("readingPane.selectMessageDesc")}
        />
      </div>
    );
  }

  if (selectedThreadId) {
    return (
      <>
        <MarkAsReadEffect emailId={selectedEmailId} />
        <ThreadView threadId={selectedThreadId} activeEmailId={selectedEmailId} />
      </>
    );
  }

  return (
    <>
      <MarkAsReadEffect emailId={selectedEmailId} />
      <MessageView emailId={selectedEmailId} />
    </>
  );
});

/** Side-effect component that marks the selected email as read after a delay */
function MarkAsReadEffect({ emailId }: { emailId: string }) {
  const queryClient = useQueryClient();
  const markReadDelay = useSettingsStore((s) => s.markReadDelay);
  const { email } = useMessage(emailId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clean up any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // -1 means "manually" — don't auto-mark
    if (markReadDelay === -1) return;

    // If the email is already read or not loaded yet, skip
    if (!email || email.keywords["$seen"]) return;

    const doMarkRead = async () => {
      try {
        // Optimistically update all email query caches
        queryClient.setQueriesData(
          { queryKey: ["emails"] },
          (oldData: unknown) => {
            if (!oldData || typeof oldData !== "object") return oldData;
            const data = oldData as {
              pages: Array<{
                emails: Array<{ id: string; keywords: Record<string, boolean> }>;
                total: number;
                position: number;
              }>;
              pageParams: unknown[];
            };
            if (!data.pages) return oldData;
            return {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                emails: page.emails.map((e) =>
                  e.id === emailId
                    ? { ...e, keywords: { ...e.keywords, $seen: true } }
                    : e,
                ),
              })),
            };
          },
        );

        // Also update the single email cache
        queryClient.setQueryData(
          ["email", emailId, "full"],
          (old: unknown) => {
            if (!old || typeof old !== "object") return old;
            const oldEmail = old as { keywords: Record<string, boolean> };
            return { ...oldEmail, keywords: { ...oldEmail.keywords, $seen: true } };
          },
        );

        // Send to server
        await updateEmails({
          [emailId]: { "keywords/$seen": true },
        });

        // Refresh mailbox counts
        queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      } catch {
        // Revert optimistic update on error
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        queryClient.invalidateQueries({ queryKey: ["email", emailId] });
      }
    };

    if (markReadDelay === 0) {
      // Immediately
      doMarkRead();
    } else {
      // After delay
      timerRef.current = setTimeout(doMarkRead, markReadDelay);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [emailId, email, markReadDelay, queryClient]);

  return null;
}

/** Loading skeleton shown while the compose panel chunk loads */
function ComposeSkeleton() {
  return (
    <div className="compose-dialog compose-dialog--inline" style={{ pointerEvents: "none" }}>
      {/* Title bar skeleton */}
      <div className="compose-dialog__titlebar">
        <Skeleton width={120} height={14} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton width={20} height={14} />
          <Skeleton width={20} height={14} />
          <Skeleton width={20} height={14} />
        </div>
      </div>
      {/* To field skeleton */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skeleton width={24} height={14} />
          <Skeleton width="40%" height={14} />
        </div>
      </div>
      {/* Subject skeleton */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skeleton width={50} height={14} />
          <Skeleton width="60%" height={14} />
        </div>
      </div>
      {/* Body skeleton */}
      <div style={{ padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton width="100%" height={14} />
        <Skeleton width="85%" height={14} />
        <Skeleton width="70%" height={14} />
      </div>
      {/* Toolbar skeleton */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--color-border-secondary)" }}>
        <Skeleton width={80} height={32} />
      </div>
    </div>
  );
}
