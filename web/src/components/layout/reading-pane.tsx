/** Reading pane container - shows message, thread, or compose view */

import React, { lazy, Suspense } from "react";
import { useUIStore } from "@/stores/ui-store.ts";
import { useComposeStore } from "@/stores/compose-store.ts";
import { MessageView } from "@/components/mail/message-view.tsx";
import { ThreadView } from "@/components/mail/thread-view.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { Mail } from "lucide-react";

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
    return <ThreadView threadId={selectedThreadId} activeEmailId={selectedEmailId} />;
  }

  return <MessageView emailId={selectedEmailId} />;
});
