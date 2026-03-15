/** Storage settings — quota display and cleanup actions */

import React, { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { HardDrive, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { destroyEmails, fetchEmails } from "@/api/mail.ts";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const StorageSettings = React.memo(function StorageSettings() {
  const { mailboxes, findByRole } = useMailboxes();
  const queryClient = useQueryClient();
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [emptyingJunk, setEmptyingJunk] = useState(false);

  // Compute total usage from mailbox sizes
  const totalEmails = mailboxes.reduce((sum, m) => sum + m.totalEmails, 0);
  const trashMailbox = findByRole("trash");
  const junkMailbox = findByRole("junk");

  // Estimate quota (JMAP Quota/get may not be available, so we derive from mailbox data)
  // For display purposes, show what we know
  const trashCount = trashMailbox?.totalEmails ?? 0;
  const junkCount = junkMailbox?.totalEmails ?? 0;

  const handleEmptyFolder = useCallback(
    async (mailboxId: string, folderName: string, setLoading: (v: boolean) => void) => {
      setLoading(true);
      try {
        // Fetch all email IDs in the folder
        const result = await fetchEmails({
          mailboxId,
          position: 0,
          limit: 500,
        });

        if (result.emails.length === 0) {
          toast.info(`${folderName} is already empty.`);
          setLoading(false);
          return;
        }

        const emailIds = result.emails.map((e) => e.id);
        await destroyEmails(emailIds);

        queryClient.invalidateQueries({ queryKey: ["emails"] });
        queryClient.invalidateQueries({ queryKey: ["mailboxes"] });

        toast.success(`Emptied ${folderName} (${emailIds.length} messages removed).`);
      } catch {
        toast.error(`Failed to empty ${folderName}.`);
      } finally {
        setLoading(false);
      }
    },
    [queryClient],
  );

  return (
    <div className="p-6 space-y-6">
      {/* Usage overview */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={16} style={{ color: "var(--color-text-secondary)" }} />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Storage usage
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              Total messages
            </span>
            <span
              className="font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {totalEmails.toLocaleString()}
            </span>
          </div>

          {/* Per-folder breakdown */}
          {mailboxes
            .filter((m) => m.totalEmails > 0)
            .sort((a, b) => b.totalEmails - a.totalEmails)
            .slice(0, 8)
            .map((mailbox) => (
              <div
                key={mailbox.id}
                className="flex items-center justify-between text-xs"
              >
                <span style={{ color: "var(--color-text-tertiary)" }}>
                  {mailbox.name}
                </span>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {mailbox.totalEmails.toLocaleString()} messages
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Quick actions */}
      <div
        className="pt-4 space-y-3"
        style={{ borderTop: "1px solid var(--color-border-secondary)" }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Quick actions
        </h3>

        {/* Empty Trash */}
        {trashMailbox && (
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                Trash
              </span>
              <span
                className="text-xs ml-2"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {trashCount} message{trashCount !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() =>
                handleEmptyFolder(trashMailbox.id, "Trash", setEmptyingTrash)
              }
              disabled={emptyingTrash || trashCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color:
                  trashCount === 0
                    ? "var(--color-text-tertiary)"
                    : "var(--color-text-danger)",
                opacity: emptyingTrash ? 0.7 : 1,
              }}
            >
              {emptyingTrash ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Empty Trash
            </button>
          </div>
        )}

        {/* Empty Junk */}
        {junkMailbox && (
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                Junk
              </span>
              <span
                className="text-xs ml-2"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {junkCount} message{junkCount !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() =>
                handleEmptyFolder(junkMailbox.id, "Junk", setEmptyingJunk)
              }
              disabled={emptyingJunk || junkCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color:
                  junkCount === 0
                    ? "var(--color-text-tertiary)"
                    : "var(--color-text-danger)",
                opacity: emptyingJunk ? 0.7 : 1,
              }}
            >
              {emptyingJunk ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <AlertTriangle size={12} />
              )}
              Empty Junk
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
