/**
 * Hook for managing background task operations via Temporal workflows.
 *
 * Provides functions to start bulk operations and export/import,
 * which run as background tasks with real-time progress via WebSocket.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  startBulkMove,
  startBulkDelete,
  startBulkMarkRead,
  startExportMailbox,
  startImportMailbox,
  uploadMboxFile,
} from "@/api/tasks.ts";

/** Threshold: use Temporal workflow for bulk ops above this count */
const BULK_THRESHOLD = 50;

export function useTasks() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const handleBulkMove = useCallback(
    async (emailIds: string[], fromMailboxId: string, toMailboxId: string) => {
      if (emailIds.length <= BULK_THRESHOLD) {
        return null; // Let the caller use direct JMAP
      }
      try {
        const result = await startBulkMove({ emailIds, fromMailboxId, toMailboxId });
        toast(t("tasks.started", { type: t("tasks.bulkMove") }));
        return result.taskId;
      } catch {
        toast.error(t("tasks.failedToStart"));
        return null;
      }
    },
    [t],
  );

  const handleBulkDelete = useCallback(
    async (emailIds: string[]) => {
      if (emailIds.length <= BULK_THRESHOLD) {
        return null;
      }
      try {
        const result = await startBulkDelete({ emailIds });
        toast(t("tasks.started", { type: t("tasks.bulkDelete") }));
        return result.taskId;
      } catch {
        toast.error(t("tasks.failedToStart"));
        return null;
      }
    },
    [t],
  );

  const handleBulkMarkRead = useCallback(
    async (emailIds: string[], markRead: boolean) => {
      if (emailIds.length <= BULK_THRESHOLD) {
        return null;
      }
      try {
        const result = await startBulkMarkRead({ emailIds, markRead });
        toast(t("tasks.started", { type: t("tasks.bulkMarkRead") }));
        return result.taskId;
      } catch {
        toast.error(t("tasks.failedToStart"));
        return null;
      }
    },
    [t],
  );

  const handleExportMailbox = useCallback(
    async (mailboxId: string, format: "mbox" | "eml-zip" = "mbox") => {
      try {
        const result = await startExportMailbox({ mailboxId, format });
        toast(t("tasks.started", { type: t("tasks.exportMailbox") }));
        return result.taskId;
      } catch {
        toast.error(t("tasks.failedToStart"));
        return null;
      }
    },
    [t],
  );

  const handleImportMailbox = useCallback(
    async (mailboxId: string, file: File) => {
      try {
        toast(t("tasks.uploading"));
        const blobId = await uploadMboxFile(file);
        const result = await startImportMailbox({ mailboxId, blobId });
        toast(t("tasks.started", { type: t("tasks.importMailbox") }));
        // Invalidate emails after import starts (will show new emails as they arrive)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["emails"] });
          queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
        }, 5000);
        return result.taskId;
      } catch {
        toast.error(t("tasks.failedToStart"));
        return null;
      }
    },
    [t, queryClient],
  );

  return {
    bulkThreshold: BULK_THRESHOLD,
    startBulkMove: handleBulkMove,
    startBulkDelete: handleBulkDelete,
    startBulkMarkRead: handleBulkMarkRead,
    startExportMailbox: handleExportMailbox,
    startImportMailbox: handleImportMailbox,
  };
}
