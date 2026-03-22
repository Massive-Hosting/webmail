/** Dialog for sharing a mailbox folder with other users */

import React, { useState, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Trash2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StyledSelect } from "@/components/ui/styled-select.tsx";
import { updateMailbox } from "@/api/mail.ts";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Mailbox, MailboxSharePermission } from "@/types/mail.ts";

interface ShareMailboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mailbox: Mailbox;
}

type PermissionLevel = "view" | "edit";

interface ShareEntry {
  email: string;
  permission: PermissionLevel;
}

function permissionToLevel(perm: MailboxSharePermission): PermissionLevel {
  return perm.mayAddItems ? "edit" : "view";
}

function levelToPermission(level: PermissionLevel): MailboxSharePermission {
  if (level === "edit") {
    return {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: true,
      mayRename: true,
      mayDelete: true,
      maySubmit: true,
    };
  }
  return { mayReadItems: true };
}

export const ShareMailboxDialog = React.memo(function ShareMailboxDialog({
  open,
  onOpenChange,
  mailbox,
}: ShareMailboxDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPermission, setNewPermission] = useState<PermissionLevel>("view");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && mailbox.shareWith) {
      const entries: ShareEntry[] = Object.entries(mailbox.shareWith).map(
        ([email, perm]) => ({
          email,
          permission: permissionToLevel(perm),
        }),
      );
      setShares(entries);
    } else if (open) {
      setShares([]);
    }
  }, [open, mailbox.shareWith]);

  const handleAddShare = useCallback(() => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (shares.some((s) => s.email === email)) return;
    setShares((prev) => [...prev, { email, permission: newPermission }]);
    setNewEmail("");
  }, [newEmail, newPermission, shares]);

  const handleRemoveShare = useCallback((email: string) => {
    setShares((prev) => prev.filter((s) => s.email !== email));
  }, []);

  const handleChangePermission = useCallback(
    (email: string, permission: PermissionLevel) => {
      setShares((prev) =>
        prev.map((s) => (s.email === email ? { ...s, permission } : s)),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const shareWith: Record<string, MailboxSharePermission> = {};
      for (const share of shares) {
        shareWith[share.email] = levelToPermission(share.permission);
      }
      await updateMailbox(mailbox.id, {
        shareWith: Object.keys(shareWith).length > 0 ? shareWith : null,
      });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success(t("sharing.saved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `${t("sharing.saveFailed")}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }, [shares, mailbox.id, queryClient, t, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg w-[440px] max-w-[90vw] overflow-hidden flex flex-col animate-scale-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-xl)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--color-border-primary)" }}
          >
            <Dialog.Title
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              <Users size={16} />
              {t("sharing.shareFolder")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <div
              className="text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {mailbox.name}
            </div>

            {/* Add new share */}
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddShare();
                }}
                placeholder={t("sharing.addPerson")}
                className="flex-1 h-8 px-2.5 text-xs rounded-md outline-none"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-secondary)",
                }}
              />
              <StyledSelect
                value={newPermission}
                onValueChange={(v) => setNewPermission(v as PermissionLevel)}
                options={[
                  { value: "view", label: t("sharing.canView") },
                  { value: "edit", label: t("sharing.canEdit") },
                ]}
                className="h-8 text-xs"
              />
              <button
                onClick={handleAddShare}
                disabled={!newEmail.trim() || !newEmail.includes("@")}
                className="h-8 px-3 text-xs font-medium rounded-md transition-colors disabled:opacity-40"
                style={{
                  backgroundColor: "var(--color-bg-accent)",
                  color: "white",
                }}
              >
                +
              </button>
            </div>

            {/* Current shares */}
            <div className="space-y-1.5">
              {shares.length === 0 ? (
                <div
                  className="text-xs py-3 text-center"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {t("sharing.noShares")}
                </div>
              ) : (
                shares.map((share) => (
                  <div
                    key={share.email}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md"
                    style={{
                      backgroundColor: "var(--color-bg-secondary)",
                    }}
                  >
                    <span
                      className="flex-1 text-xs truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {share.email}
                    </span>
                    <StyledSelect
                      value={share.permission}
                      onValueChange={(v) => handleChangePermission(share.email, v as PermissionLevel)}
                      options={[
                        { value: "view", label: t("sharing.canView") },
                        { value: "edit", label: t("sharing.canEdit") },
                      ]}
                      className="h-6 text-[11px]"
                    />
                    <button
                      onClick={() => handleRemoveShare(share.email)}
                      className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                      style={{ color: "var(--color-text-danger)" }}
                      title={t("sharing.removeAccess")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--color-border-primary)" }}
          >
            <Dialog.Close asChild>
              <button
                className="h-8 px-4 text-xs font-medium rounded-md transition-colors"
                style={{
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-secondary)",
                }}
              >
                {t("sharing.close")}
              </button>
            </Dialog.Close>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-4 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-bg-accent)",
                color: "white",
              }}
            >
              {saving ? "..." : t("sharing.save")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
