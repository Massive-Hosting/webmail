/** Compose dialog - inline, pop-out, fullscreen, and minimized modes */

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  ExternalLink,
  Send,
  Paperclip,
  Loader2,
  Check,
  Lock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  useComposeStore,
  type DraftState,
} from "@/stores/compose-store.ts";
import { ComposeEditor, toEmailSafeHTML } from "./editor.tsx";
import { RecipientInput } from "./recipient-input.tsx";
import { AttachmentList, DragDropZone, useAttachmentUpload } from "./attachment-list.tsx";
import { sendEmail, saveDraft, destroyDraft, fetchIdentities } from "@/api/mail.ts";
import type { Email, Identity } from "@/types/mail.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { toast } from "sonner";
import { format } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePGPStore } from "@/stores/pgp-store.ts";
import { encryptMessage, signMessage } from "@/lib/pgp.ts";
import { lookupPublicKeys } from "@/lib/pgp-lookup.ts";

// Re-export useCompose from its own module (keeps it out of the lazy-loaded chunk)
export { useCompose } from "./use-compose.ts";

// ---- ComposePanel: the actual compose UI for a single draft ----

interface ComposePanelProps {
  draftId: string;
}

export const ComposePanel = React.memo(function ComposePanel({
  draftId,
}: ComposePanelProps) {
  const draft = useComposeStore((s) => s.drafts.get(draftId));
  const updateDraft = useComposeStore((s) => s.updateDraft);
  const closeDraft = useComposeStore((s) => s.closeDraft);
  const minimizeDraft = useComposeStore((s) => s.minimizeDraft);
  const maximizeDraft = useComposeStore((s) => s.maximizeDraft);
  const { uploadFiles } = useAttachmentUpload(draftId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const { findByRole } = useMailboxes();

  // PGP state
  const pgpIsSetUp = usePGPStore((s) => s.isSetUp);
  const pgpIsUnlocked = usePGPStore((s) => s.isUnlocked);
  const pgpSignDefault = usePGPStore((s) => s.signDefault);
  const pgpEncryptDefault = usePGPStore((s) => s.encryptDefault);
  const pgpPrivateKey = usePGPStore((s) => s.privateKeyArmored);
  const pgpPublicKey = usePGPStore((s) => s.publicKeyArmored);
  const pgpPassphrase = usePGPStore((s) => s.passphrase);

  const [pgpSign, setPgpSign] = useState(false);
  const [pgpEncrypt, setPgpEncrypt] = useState(false);
  const [missingKeyRecipients, setMissingKeyRecipients] = useState<string[]>([]);
  const [showMissingKeyDialog, setShowMissingKeyDialog] = useState(false);

  // Set PGP defaults
  useEffect(() => {
    if (pgpIsSetUp && pgpIsUnlocked) {
      setPgpSign(pgpSignDefault === "always");
      setPgpEncrypt(pgpEncryptDefault === "always");
    }
  }, [pgpIsSetUp, pgpIsUnlocked, pgpSignDefault, pgpEncryptDefault]);

  // Fetch identities
  const { data: identities } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    staleTime: 5 * 60 * 1000,
  });

  // Set default identity on first render if not set
  useEffect(() => {
    if (draft && !draft.from && identities && identities.length > 0) {
      updateDraft(draftId, { from: identities[0] });
      // If identity has signature and body is empty, insert signature
      if (!draft.bodyHTML && identities[0].htmlSignature) {
        const sig = `<p><br></p><p>-- </p>${identities[0].htmlSignature}`;
        updateDraft(draftId, { bodyHTML: sig, isDirty: false });
      }
    }
  }, [draft, identities, draftId, updateDraft]);

  // Auto-save timer: 3 seconds after last edit
  useEffect(() => {
    if (!draft?.isDirty) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleAutoSave();
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [draft?.isDirty, draft?.subject, draft?.bodyHTML, draft?.to, draft?.cc, draft?.bcc]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const store = useComposeStore.getState();
      const hasUnsaved = Array.from(store.drafts.values()).some((d) => d.isDirty);
      if (hasUnsaved) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleAutoSave = useCallback(async () => {
    const currentDraft = useComposeStore.getState().drafts.get(draftId);
    if (!currentDraft || !currentDraft.isDirty) return;

    const draftsMailbox = findByRole("drafts");
    if (!draftsMailbox) return;

    updateDraft(draftId, { saving: true });

    try {
      const emailId = await saveDraft({
        emailId: currentDraft.emailId,
        mailboxId: draftsMailbox.id,
        from: currentDraft.from,
        to: currentDraft.to.filter((r) => r.isValid),
        cc: currentDraft.cc.filter((r) => r.isValid),
        bcc: currentDraft.bcc.filter((r) => r.isValid),
        subject: currentDraft.subject,
        bodyHTML: currentDraft.bodyHTML,
        bodyText: currentDraft.bodyText || stripHtml(currentDraft.bodyHTML),
        attachments: currentDraft.attachments.filter(
          (a) => a.status === "complete" && a.blobId,
        ),
        inReplyTo: currentDraft.inReplyTo,
        references: currentDraft.references,
      });

      updateDraft(draftId, {
        emailId: emailId ?? currentDraft.emailId,
        isDirty: false,
        saving: false,
        lastSaved: new Date(),
        saveError: undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    } catch (err) {
      updateDraft(draftId, {
        saving: false,
        saveError: "Failed to save draft",
      });
    }
  }, [draftId, findByRole, updateDraft, queryClient]);

  const handleSend = useCallback(async () => {
    const currentDraft = useComposeStore.getState().drafts.get(draftId);
    if (!currentDraft) return;

    // Validate recipients
    const validTo = currentDraft.to.filter((r) => r.isValid);
    const validCc = currentDraft.cc.filter((r) => r.isValid);
    const validBcc = currentDraft.bcc.filter((r) => r.isValid);

    if (validTo.length === 0 && validCc.length === 0 && validBcc.length === 0) {
      toast.error("Please add at least one recipient.");
      return;
    }

    // Warn if empty subject
    if (!currentDraft.subject.trim()) {
      const proceed = window.confirm("Send without a subject?");
      if (!proceed) return;
    }

    // PGP encryption: resolve recipient keys if encrypting
    if (pgpEncrypt && pgpIsUnlocked && pgpPrivateKey && pgpPassphrase) {
      const allRecipientEmails = [
        ...validTo.map((r) => r.email),
        ...validCc.map((r) => r.email),
        ...validBcc.map((r) => r.email),
      ];
      const foundKeys = await lookupPublicKeys(allRecipientEmails);
      const missing = allRecipientEmails.filter(
        (e) => !foundKeys.has(e.toLowerCase()),
      );
      if (missing.length > 0) {
        setMissingKeyRecipients(missing);
        setShowMissingKeyDialog(true);
        return;
      }
    }

    const draftsMailbox = findByRole("drafts");
    const sentMailbox = findByRole("sent");

    updateDraft(draftId, { saving: true });

    try {
      const emailSafeHTML = toEmailSafeHTML(currentDraft.bodyHTML);
      let plainText = stripHtml(currentDraft.bodyHTML);
      let finalHTML = emailSafeHTML;

      // PGP sign-only (no encryption)
      if (pgpSign && !pgpEncrypt && pgpIsUnlocked && pgpPrivateKey && pgpPassphrase) {
        try {
          const signed = await signMessage(plainText, pgpPrivateKey, pgpPassphrase);
          plainText = signed;
          finalHTML = `<pre style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(signed)}</pre>`;
        } catch (err) {
          toast.error("Failed to sign message. Sending unsigned.");
        }
      }

      // PGP encrypt (+ sign if enabled)
      if (pgpEncrypt && pgpIsUnlocked && pgpPrivateKey && pgpPassphrase) {
        try {
          const allRecipientEmails = [
            ...validTo.map((r) => r.email),
            ...validCc.map((r) => r.email),
            ...validBcc.map((r) => r.email),
          ];
          const foundKeys = await lookupPublicKeys(allRecipientEmails);
          const recipientKeys = Array.from(foundKeys.values());

          // Also encrypt to self so sender can read the sent copy
          if (pgpPublicKey) {
            recipientKeys.push(pgpPublicKey);
          }

          const encrypted = await encryptMessage(
            plainText,
            recipientKeys,
            pgpSign ? pgpPrivateKey : undefined,
            pgpSign ? pgpPassphrase : undefined,
          );
          plainText = encrypted;
          finalHTML = `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px;">${escapeHtml(encrypted)}</pre>`;
        } catch (err) {
          updateDraft(draftId, { saving: false });
          toast.error("Failed to encrypt message. Please try again.");
          return;
        }
      }

      await sendEmail({
        from: currentDraft.from,
        to: validTo,
        cc: validCc,
        bcc: validBcc,
        subject: currentDraft.subject,
        bodyHTML: finalHTML,
        bodyText: plainText,
        attachments: currentDraft.attachments.filter(
          (a) => a.status === "complete" && a.blobId,
        ),
        inReplyTo: currentDraft.inReplyTo,
        references: currentDraft.references,
        draftEmailId: currentDraft.emailId,
        draftsMailboxId: draftsMailbox?.id,
        sentMailboxId: sentMailbox?.id,
      });

      closeDraft(draftId);

      toast.success("Message sent", { duration: 3000 });

      // Refresh mailbox counts
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    } catch (err) {
      updateDraft(draftId, { saving: false });
      toast.error("Failed to send message. Please try again.");
    }
  }, [draftId, findByRole, closeDraft, updateDraft, queryClient, pgpSign, pgpEncrypt, pgpIsUnlocked, pgpPrivateKey, pgpPublicKey, pgpPassphrase]);

  const handleDiscard = useCallback(() => {
    const currentDraft = useComposeStore.getState().drafts.get(draftId);
    if (currentDraft?.isDirty) {
      const proceed = window.confirm("Discard unsaved changes?");
      if (!proceed) return;
    }

    // Destroy server-side draft if it exists
    if (currentDraft?.emailId) {
      destroyDraft(currentDraft.emailId).catch(() => {
        // silently fail
      });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    }

    closeDraft(draftId);
  }, [draftId, closeDraft, queryClient]);

  const handleIdentityChange = useCallback(
    (identityId: string) => {
      const identity = identities?.find((i) => i.id === identityId);
      if (!identity) return;

      const currentDraft = useComposeStore.getState().drafts.get(draftId);
      if (!currentDraft) return;

      let bodyHTML = currentDraft.bodyHTML;

      // Swap signature: remove old, add new
      const oldIdentity = currentDraft.from;
      if (oldIdentity?.htmlSignature) {
        // Try to remove old signature
        const sigSep = '<p>-- </p>';
        const oldSigIdx = bodyHTML.indexOf(sigSep);
        if (oldSigIdx !== -1) {
          // Find where the old signature ends (before quoted text or end)
          const quotedIdx = bodyHTML.indexOf('<div style="border-left:');
          const fwdIdx = bodyHTML.indexOf('<div style="border-top:');
          const endIdx = Math.min(
            quotedIdx !== -1 ? quotedIdx : bodyHTML.length,
            fwdIdx !== -1 ? fwdIdx : bodyHTML.length,
          );
          bodyHTML =
            bodyHTML.slice(0, oldSigIdx) +
            (identity.htmlSignature
              ? `${sigSep}${identity.htmlSignature}`
              : "") +
            bodyHTML.slice(endIdx);
        }
      } else if (identity.htmlSignature) {
        // No old sig, add new one
        const quotedIdx = bodyHTML.indexOf('<div style="border-left:');
        const fwdIdx = bodyHTML.indexOf('<div style="border-top:');
        const insertIdx = Math.min(
          quotedIdx !== -1 ? quotedIdx : bodyHTML.length,
          fwdIdx !== -1 ? fwdIdx : bodyHTML.length,
        );
        bodyHTML =
          bodyHTML.slice(0, insertIdx) +
          `<p>-- </p>${identity.htmlSignature}` +
          bodyHTML.slice(insertIdx);
      }

      updateDraft(draftId, { from: identity, bodyHTML });
    },
    [draftId, identities, updateDraft],
  );

  // Keyboard shortcut: Ctrl+Enter to send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend]);

  if (!draft) return null;

  const isMinimized = draft.windowMode === "minimized";

  // Minimized bar
  if (isMinimized) {
    return (
      <MinimizedBar
        draftId={draftId}
        subject={draft.subject}
        to={draft.to}
        onMaximize={() => maximizeDraft(draftId)}
        onClose={handleDiscard}
      />
    );
  }

  const isFullscreen = draft.windowMode === "fullscreen";
  const isPopout = draft.windowMode === "popout";

  return (
    <DragDropZone draftId={draftId}>
      <div
        className={`flex flex-col animate-slide-up ${
          isFullscreen
            ? "fixed inset-0 z-50"
            : isPopout
              ? "fixed bottom-4 right-4 z-40 w-[560px] rounded-lg shadow-xl"
              : "h-full"
        }`}
        role="dialog"
        aria-labelledby={`compose-title-${draftId}`}
        style={{
          backgroundColor: "var(--color-bg-primary)",
          border: isPopout ? "1px solid var(--color-border-primary)" : undefined,
          maxHeight: isPopout ? "80vh" : undefined,
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderBottom: "1px solid var(--color-border-secondary)",
          }}
        >
          <span
            id={`compose-title-${draftId}`}
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {draft.composeMode === "reply"
              ? "Reply"
              : draft.composeMode === "reply-all"
                ? "Reply All"
                : draft.composeMode === "forward"
                  ? "Forward"
                  : "New Message"}
          </span>
          <div className="flex items-center gap-1">
            {/* Save status */}
            <SaveIndicator
              saving={draft.saving}
              lastSaved={draft.lastSaved}
              saveError={draft.saveError}
            />
            <button
              type="button"
              onClick={() => minimizeDraft(draftId)}
              className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-secondary)" }}
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            {!isFullscreen && (
              <button
                type="button"
                onClick={() =>
                  updateDraft(draftId, {
                    windowMode: isPopout ? "inline" : "popout",
                  })
                }
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-secondary)" }}
                title={isPopout ? "Dock" : "Pop out"}
              >
                <ExternalLink size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                updateDraft(draftId, {
                  windowMode: isFullscreen ? "inline" : "fullscreen",
                })
              }
              className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-secondary)" }}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-secondary)" }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* From identity dropdown */}
        {identities && identities.length > 1 && (
          <div
            className="flex items-center gap-2 px-4 py-1.5"
            style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
          >
            <label
              className="text-xs font-medium shrink-0 w-8"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              From
            </label>
            <select
              value={draft.from?.id ?? ""}
              onChange={(e) => handleIdentityChange(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none cursor-pointer"
              style={{ color: "var(--color-text-primary)" }}
            >
              {identities.map((id) => (
                <option key={id.id} value={id.id}>
                  {id.name} &lt;{id.email}&gt;
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Recipients */}
        <RecipientInput
          label="To"
          recipients={draft.to}
          onChange={(to) => updateDraft(draftId, { to })}
        />

        {/* Show Cc/Bcc toggle */}
        {!draft.showCc && !draft.showBcc && (
          <div
            className="flex items-center gap-2 px-4 py-0.5"
            style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
          >
            <div className="w-8" />
            <button
              type="button"
              className="text-xs"
              style={{ color: "var(--color-text-accent)" }}
              onClick={() => updateDraft(draftId, { showCc: true })}
            >
              Cc
            </button>
            <button
              type="button"
              className="text-xs"
              style={{ color: "var(--color-text-accent)" }}
              onClick={() => updateDraft(draftId, { showBcc: true })}
            >
              Bcc
            </button>
          </div>
        )}

        {draft.showCc && (
          <RecipientInput
            label="Cc"
            recipients={draft.cc}
            onChange={(cc) => updateDraft(draftId, { cc })}
          />
        )}
        {draft.showBcc && (
          <RecipientInput
            label="Bcc"
            recipients={draft.bcc}
            onChange={(bcc) => updateDraft(draftId, { bcc })}
          />
        )}

        {/* Subject */}
        <div
          className="flex items-center gap-2 px-4 py-1.5"
          style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
        >
          <label
            className="text-xs font-medium shrink-0 w-8"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Subj
          </label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => updateDraft(draftId, { subject: e.target.value })}
            placeholder="Subject"
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <ComposeEditor
            content={draft.bodyHTML}
            onChange={(html) => updateDraft(draftId, { bodyHTML: html })}
            onPasteImage={(file) => uploadFiles([file])}
          />
        </div>

        {/* Attachments */}
        <AttachmentList draftId={draftId} attachments={draft.attachments} />

        {/* Bottom toolbar */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderTop: "1px solid var(--color-border-secondary)",
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={draft.saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-medium text-white transition-colors"
              style={{
                backgroundColor: draft.saving
                  ? "var(--color-bg-accent-muted, #6b7280)"
                  : "var(--color-bg-accent)",
                opacity: draft.saving ? 0.7 : 1,
              }}
            >
              {draft.saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Send
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-secondary)" }}
              title="Attach files"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            {/* PGP toggles (only when PGP is set up) */}
            {pgpIsSetUp && pgpIsUnlocked && (
              <>
                <div
                  className="w-px h-5 mx-1"
                  style={{ backgroundColor: "var(--color-border-secondary)" }}
                />
                <button
                  type="button"
                  onClick={() => setPgpSign(!pgpSign)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                  style={{
                    color: pgpSign ? "#22c55e" : "var(--color-text-tertiary)",
                    backgroundColor: pgpSign ? "rgba(34, 197, 94, 0.1)" : "transparent",
                  }}
                  title={pgpSign ? "Signing enabled" : "Signing disabled"}
                >
                  <ShieldCheck size={14} />
                  Sign
                </button>
                <button
                  type="button"
                  onClick={() => setPgpEncrypt(!pgpEncrypt)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                  style={{
                    color: pgpEncrypt ? "#3b82f6" : "var(--color-text-tertiary)",
                    backgroundColor: pgpEncrypt ? "rgba(59, 130, 246, 0.1)" : "transparent",
                  }}
                  title={pgpEncrypt ? "Encryption enabled" : "Encryption disabled"}
                >
                  <Lock size={14} />
                  Encrypt
                </button>
              </>
            )}
          </div>

          <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            Ctrl+Enter to send
          </span>
        </div>
      </div>

      {/* Missing PGP key dialog */}
      {showMissingKeyDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="w-full max-w-sm rounded-lg p-5 flex flex-col gap-4"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-primary)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <h3
              className="text-sm font-semibold flex items-center gap-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              <AlertTriangle size={16} style={{ color: "#eab308" }} />
              Cannot encrypt to all recipients
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              The following recipients do not have a PGP public key:
            </p>
            <ul className="flex flex-col gap-1">
              {missingKeyRecipients.map((email) => (
                <li
                  key={email}
                  className="text-sm flex items-center gap-1.5"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <AlertTriangle size={12} style={{ color: "#eab308" }} />
                  {email}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowMissingKeyDialog(false)}
                className="px-3 py-1.5 text-sm rounded-md"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-bg-tertiary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowMissingKeyDialog(false);
                  setPgpEncrypt(false);
                  // Re-trigger send without encryption
                  handleSend();
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md"
                style={{
                  color: "var(--color-text-primary)",
                  backgroundColor: "var(--color-bg-tertiary)",
                }}
              >
                Send unencrypted
              </button>
            </div>
          </div>
        </div>
      )}
    </DragDropZone>
  );
});

// ---- Minimized bar ----

function MinimizedBar({
  draftId,
  subject,
  to,
  onMaximize,
  onClose,
}: {
  draftId: string;
  subject: string;
  to: DraftState["to"];
  onMaximize: () => void;
  onClose: () => void;
}) {
  const toText = to.map((r) => r.name ?? r.email).join(", ");

  return (
    <button
      type="button"
      onClick={onMaximize}
      className="flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm w-[260px] hover:opacity-90 transition-opacity"
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border-primary)",
        borderBottom: "none",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <span className="truncate flex-1 text-left font-medium">
        {subject || "New Message"}
      </span>
      {toText && (
        <span
          className="truncate text-xs"
          style={{ color: "var(--color-text-tertiary)", maxWidth: 80 }}
        >
          {toText}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <X size={12} />
      </button>
    </button>
  );
}

// ---- Save indicator ----

function SaveIndicator({
  saving,
  lastSaved,
  saveError,
}: {
  saving: boolean;
  lastSaved?: Date;
  saveError?: string;
}) {
  if (saveError) {
    return (
      <span className="text-xs mr-2" style={{ color: "var(--color-text-error, #dc2626)" }}>
        Save failed
      </span>
    );
  }
  if (saving) {
    return (
      <span className="text-xs mr-2 flex items-center gap-1" style={{ color: "var(--color-text-tertiary)" }}>
        <Loader2 size={10} className="animate-spin" />
        Saving...
      </span>
    );
  }
  if (lastSaved) {
    return (
      <span className="text-xs mr-2 flex items-center gap-1" style={{ color: "var(--color-text-tertiary)" }}>
        <Check size={10} />
        Saved at {format(lastSaved, "h:mm a")}
      </span>
    );
  }
  return null;
}

// ---- Compose container that renders from app shell ----

export function ComposeContainer() {
  const drafts = useComposeStore((s) => s.drafts);
  const activeDraftId = useComposeStore((s) => s.activeDraftId);

  const minimizedDrafts = useMemo(
    () => Array.from(drafts.entries()).filter(([, d]) => d.windowMode === "minimized"),
    [drafts],
  );

  const activeDraft = activeDraftId ? drafts.get(activeDraftId) : undefined;
  const showActiveInline =
    activeDraft && activeDraft.windowMode !== "minimized";

  // Pop-out drafts (rendered as portals)
  const popoutDrafts = useMemo(
    () =>
      Array.from(drafts.entries()).filter(
        ([id, d]) =>
          d.windowMode === "popout" && id !== activeDraftId,
      ),
    [drafts, activeDraftId],
  );

  // Fullscreen drafts
  const fullscreenDrafts = useMemo(
    () =>
      Array.from(drafts.entries()).filter(
        ([, d]) => d.windowMode === "fullscreen",
      ),
    [drafts],
  );

  return (
    <>
      {/* Inline active draft (replaces reading pane) */}
      {showActiveInline && activeDraft.windowMode === "inline" && (
        <ComposePanel draftId={activeDraftId!} />
      )}

      {/* Fullscreen drafts */}
      {fullscreenDrafts.map(([id]) => (
        <ComposePanel key={id} draftId={id} />
      ))}

      {/* Pop-out drafts */}
      {popoutDrafts.map(([id]) => (
        <ComposePanel key={id} draftId={id} />
      ))}

      {/* Active pop-out */}
      {showActiveInline && activeDraft.windowMode === "popout" && (
        <ComposePanel draftId={activeDraftId!} />
      )}

      {/* Minimized drafts bar at bottom */}
      {minimizedDrafts.length > 0 && (
        <div className="fixed bottom-0 right-4 z-30 flex items-end gap-2">
          {minimizedDrafts.map(([id]) => (
            <ComposePanel key={id} draftId={id} />
          ))}
        </div>
      )}
    </>
  );
}

/** Strip HTML tags to get plain text */
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}
