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
import { useQueryClient } from "@tanstack/react-query";
import { useMessage } from "@/hooks/use-message.ts";

const ComposePanel = lazy(() =>
  import("@/components/mail/compose/compose-dialog.tsx").then((m) => ({ default: m.ComposePanel }))
);

export const ReadingPane = React.memo(function ReadingPane() {
  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const selectedThreadId = useUIStore((s) => s.selectedThreadId);
  const activeDraftId = useComposeStore((s) => s.activeDraftId);
  const activeDraft = useComposeStore((s) =>
    s.activeDraftId ? s.drafts.get(s.activeDraftId) : undefined,
  );

  // Show inline compose if active draft is in inline mode
  if (activeDraftId && activeDraft?.windowMode === "inline") {
    return (
      <Suspense fallback={<div />}>
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
          title="Select a message to read"
          description="Choose a message from the list to view its contents here."
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
