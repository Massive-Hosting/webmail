/** Compose dialog - inline, pop-out, fullscreen, and minimized modes - premium design */

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
  Sparkles,
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
import { useSettingsStore } from "@/stores/settings-store.ts";
import { useAIEnabled } from "@/hooks/use-ai-enabled.ts";
import { AIPanel } from "./ai-panel.tsx";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store.ts";

// Re-export useCompose from its own module (keeps it out of the lazy-loaded chunk)
export { useCompose } from "./use-compose.ts";
import { escapeHtml } from "./use-compose.ts";

// ---- ComposePanel: the actual compose UI for a single draft ----

interface ComposePanelProps {
  draftId: string;
}

export const ComposePanel = React.memo(function ComposePanel({
  draftId,
}: ComposePanelProps) {
  const { t } = useTranslation();
  const draft = useComposeStore((s) => s.drafts.get(draftId));
  const updateDraft = useComposeStore((s) => s.updateDraft);
  const closeDraft = useComposeStore((s) => s.closeDraft);
  const minimizeDraft = useComposeStore((s) => s.minimizeDraft);
  const maximizeDraft = useComposeStore((s) => s.maximizeDraft);
  const { uploadFiles } = useAttachmentUpload(draftId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoSendToastIdRef = useRef<string | number | undefined>(undefined);
  const queryClient = useQueryClient();
  const undoSendDelay = useSettingsStore((s) => s.undoSendDelay);

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

  // AI assistant state
  const aiEnabled = useAIEnabled();
  const [showAIPanel, setShowAIPanel] = useState(false);

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
  // Prefer the identity whose email matches the logged-in user's email
  useEffect(() => {
    if (draft && !draft.from && identities && identities.length > 0) {
      const userEmail = useAuthStore.getState().email;
      const matchingIdentity = identities.find((i) => i.email === userEmail) ?? identities[0];
      updateDraft(draftId, { from: matchingIdentity });
      // If identity has signature and body is empty, insert signature
      if (!draft.bodyHTML && matchingIdentity.htmlSignature) {
        const sig = `<p><br></p><p>-- </p>${matchingIdentity.htmlSignature}`;
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

    // Use pre-resolved draftsMailboxId, fall back to findByRole
    const mailboxId = currentDraft.draftsMailboxId ?? findByRole("drafts")?.id;
    if (!mailboxId) {
      // Mailboxes not loaded yet — retry after a short delay
      setTimeout(() => handleAutoSave(), 2000);
      return;
    }

    // Persist the resolved ID for future saves
    if (!currentDraft.draftsMailboxId) {
      updateDraft(draftId, { draftsMailboxId: mailboxId });
    }

    updateDraft(draftId, { saving: true });

    try {
      const emailId = await saveDraft({
        emailId: currentDraft.emailId,
        mailboxId,
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
        saveError: t("compose.failedToSaveDraft"),
      });
    }
  }, [draftId, findByRole, updateDraft, queryClient]);

  /** Actually perform the send (called immediately or after undo delay) */
  const executeSend = useCallback(async () => {
    const currentDraft = useComposeStore.getState().drafts.get(draftId);
    if (!currentDraft) return;

    const validTo = currentDraft.to.filter((r) => r.isValid);
    const validCc = currentDraft.cc.filter((r) => r.isValid);
    const validBcc = currentDraft.bcc.filter((r) => r.isValid);

    const draftsMailboxId = currentDraft.draftsMailboxId ?? findByRole("drafts")?.id;
    const sentMailboxId = currentDraft.sentMailboxId ?? findByRole("sent")?.id;

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
          toast.error(t("compose.failedToSign"));
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
          toast.error(t("compose.failedToEncrypt"));
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
        draftsMailboxId,
        sentMailboxId,
      });

      closeDraft(draftId);

      toast.success(t("compose.messageSent"), { duration: 3000 });

      // Refresh mailbox counts
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    } catch (err) {
      updateDraft(draftId, { saving: false });
      toast.error(t("compose.failedToSend"));
    }
  }, [draftId, findByRole, closeDraft, updateDraft, queryClient, pgpSign, pgpEncrypt, pgpIsUnlocked, pgpPrivateKey, pgpPublicKey, pgpPassphrase, t]);

  const handleSend = useCallback(async () => {
    const currentDraft = useComposeStore.getState().drafts.get(draftId);
    if (!currentDraft) return;

    // Validate recipients
    const validTo = currentDraft.to.filter((r) => r.isValid);
    const validCc = currentDraft.cc.filter((r) => r.isValid);
    const validBcc = currentDraft.bcc.filter((r) => r.isValid);

    if (validTo.length === 0 && validCc.length === 0 && validBcc.length === 0) {
      toast.error(t("compose.addRecipient"));
      return;
    }

    // Warn if empty subject
    if (!currentDraft.subject.trim()) {
      const proceed = window.confirm(t("compose.sendWithoutSubject"));
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

    // Undo send: if delay is configured, show countdown toast
    if (undoSendDelay > 0) {
      // Cancel any existing undo send timer
      if (undoSendTimerRef.current) {
        clearTimeout(undoSendTimerRef.current);
        undoSendTimerRef.current = null;
      }

      let cancelled = false;

      const toastId = toast(t("compose.sending"), {
        duration: undoSendDelay * 1000 + 500,
        action: {
          label: t("compose.undo"),
          onClick: () => {
            cancelled = true;
            if (undoSendTimerRef.current) {
              clearTimeout(undoSendTimerRef.current);
              undoSendTimerRef.current = null;
            }
            toast.success(t("compose.sendCancelled"), { duration: 2000 });
          },
        },
        onDismiss: () => {
          // If dismissed without clicking undo and timer is still pending, do nothing
        },
      });
      undoSendToastIdRef.current = toastId;

      undoSendTimerRef.current = setTimeout(() => {
        undoSendTimerRef.current = null;
        if (!cancelled) {
          toast.dismiss(toastId);
          executeSend();
        }
      }, undoSendDelay * 1000);

      return;
    }

    // No delay: send immediately
    await executeSend();
  }, [draftId, executeSend, undoSendDelay, pgpEncrypt, pgpIsUnlocked, pgpPrivateKey, pgpPassphrase]);

  // Clean up undo send timer on unmount
  useEffect(() => {
    return () => {
      if (undoSendTimerRef.current) {
        clearTimeout(undoSendTimerRef.current);
      }
    };
  }, []);

  const handleDiscard = useCallback(() => {
    const currentDraft = useComposeStore.getState().drafts.get(draftId);
    if (currentDraft?.isDirty) {
      const proceed = window.confirm(t("compose.discardChanges"));
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
        const sigSep = '<p>-- </p>';
        const oldSigIdx = bodyHTML.indexOf(sigSep);
        if (oldSigIdx !== -1) {
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

  const composeTitle = draft.composeMode === "reply"
    ? t("compose.reply")
    : draft.composeMode === "reply-all"
      ? t("compose.replyAll")
      : draft.composeMode === "forward"
        ? t("compose.forward")
        : t("compose.newMessage");

  return (
    <DragDropZone draftId={draftId}>
      <div
        className={`compose-dialog ${
          isFullscreen
            ? "compose-dialog--fullscreen"
            : isPopout
              ? "compose-dialog--popout"
              : "compose-dialog--inline"
        }`}
        role="dialog"
        aria-labelledby={`compose-title-${draftId}`}
      >
        {/* Title bar */}
        <div className="compose-dialog__titlebar">
          <span
            id={`compose-title-${draftId}`}
            className="compose-dialog__title"
          >
            {composeTitle}
          </span>
          <div className="compose-dialog__titlebar-actions">
            <SaveIndicator
              saving={draft.saving}
              lastSaved={draft.lastSaved}
              saveError={draft.saveError}
            />
            <button
              type="button"
              onClick={() => minimizeDraft(draftId)}
              className="compose-dialog__window-btn"
              title={t("compose.minimize")}
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
                className="compose-dialog__window-btn"
                title={isPopout ? t("compose.dock") : t("compose.popOut")}
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
              className="compose-dialog__window-btn"
              title={isFullscreen ? t("compose.exitFullscreen") : t("compose.fullscreen")}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="compose-dialog__window-btn compose-dialog__window-btn--close"
              title={t("compose.close")}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* From identity dropdown */}
        {identities && identities.length > 1 && (
          <div className="compose-dialog__field">
            <label className="compose-dialog__field-label">{t("compose.from")}</label>
            <select
              value={draft.from?.id ?? ""}
              onChange={(e) => handleIdentityChange(e.target.value)}
              className="compose-dialog__identity-select"
            >
              {identities.map((id) => (
                <option key={id.id} value={id.id}>
                  {id.name} &lt;{id.email}&gt;
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Recipients: To row with inline Cc/Bcc toggles */}
        <div className="compose-dialog__to-row">
          <RecipientInput
            label="To"
            recipients={draft.to}
            onChange={(to) => updateDraft(draftId, { to })}
          />
          <div className="compose-dialog__cc-toggles">
            <button
              type="button"
              className={`compose-dialog__cc-toggle-btn ${draft.showCc ? "compose-dialog__cc-toggle-btn--active" : ""}`}
              onClick={() => {
                if (draft.showCc && draft.cc.length === 0) {
                  updateDraft(draftId, { showCc: false });
                } else {
                  updateDraft(draftId, { showCc: true });
                }
              }}
            >
              Cc
            </button>
            <button
              type="button"
              className={`compose-dialog__cc-toggle-btn ${draft.showBcc ? "compose-dialog__cc-toggle-btn--active" : ""}`}
              onClick={() => {
                if (draft.showBcc && draft.bcc.length === 0) {
                  updateDraft(draftId, { showBcc: false });
                } else {
                  updateDraft(draftId, { showBcc: true });
                }
              }}
            >
              Bcc
            </button>
          </div>
        </div>

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
        <div className="compose-dialog__field">
          <label className="compose-dialog__field-label">{t("compose.subject")}</label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => updateDraft(draftId, { subject: e.target.value })}
            placeholder={t("compose.subject")}
            className="compose-dialog__subject-input"
          />
        </div>

        {/* AI Panel (above editor) */}
        {showAIPanel && aiEnabled && (
          <AIPanel
            isReply={draft.composeMode === "reply" || draft.composeMode === "reply-all"}
            originalEmailBody={draft.bodyHTML}
            onInsert={(text) => {
              // Convert plain text to HTML paragraphs and prepend to body
              const htmlText = text
                .split("\n\n")
                .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
                .join("");
              updateDraft(draftId, { bodyHTML: htmlText + draft.bodyHTML });
            }}
            onClose={() => setShowAIPanel(false)}
          />
        )}

        {/* Editor */}
        <div className="compose-dialog__editor">
          <ComposeEditor
            content={draft.bodyHTML}
            onChange={(html) => updateDraft(draftId, { bodyHTML: html })}
            onPasteImage={(file) => uploadFiles([file])}
          />
        </div>

        {/* Attachments */}
        <AttachmentList draftId={draftId} attachments={draft.attachments} />

        {/* Bottom toolbar */}
        <div className="compose-dialog__toolbar">
          <div className="compose-dialog__toolbar-left">
            <button
              type="button"
              onClick={handleSend}
              disabled={draft.saving}
              className="compose-dialog__send-btn"
            >
              {draft.saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={15} />
              )}
              {t("compose.send")}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="compose-dialog__attach-btn"
              title={t("compose.attachFiles")}
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

            {/* AI Assist button (only when AI is enabled) */}
            {aiEnabled && (
              <>
                <div className="compose-dialog__separator" />
                <button
                  type="button"
                  onClick={() => setShowAIPanel(!showAIPanel)}
                  className={`compose-dialog__ai-btn ${showAIPanel ? "compose-dialog__ai-btn--active" : ""}`}
                  title={t("ai.aiAssistTitle")}
                >
                  <Sparkles size={14} />
                  {t("ai.aiAssist")}
                </button>
              </>
            )}

            {/* PGP toggles (only when PGP is set up) */}
            {pgpIsSetUp && pgpIsUnlocked && (
              <>
                <div className="compose-dialog__separator" />
                <button
                  type="button"
                  onClick={() => setPgpSign(!pgpSign)}
                  className={`compose-dialog__pgp-btn ${pgpSign ? "compose-dialog__pgp-btn--sign-active" : ""}`}
                  title={pgpSign ? t("compose.signingEnabled") : t("compose.signingDisabled")}
                >
                  <ShieldCheck size={14} />
                  {t("compose.sign")}
                </button>
                <button
                  type="button"
                  onClick={() => setPgpEncrypt(!pgpEncrypt)}
                  className={`compose-dialog__pgp-btn ${pgpEncrypt ? "compose-dialog__pgp-btn--encrypt-active" : ""}`}
                  title={pgpEncrypt ? t("compose.encryptionEnabled") : t("compose.encryptionDisabled")}
                >
                  <Lock size={14} />
                  {t("compose.encrypt")}
                </button>
              </>
            )}
          </div>

          <span className="compose-dialog__shortcut-hint">
            {t("compose.ctrlEnterToSend")}
          </span>
        </div>
      </div>

      {/* Missing PGP key dialog */}
      {showMissingKeyDialog && (
        <div className="compose-dialog__overlay">
          <div className="compose-dialog__pgp-dialog">
            <h3 className="compose-dialog__pgp-dialog-title">
              <AlertTriangle size={16} style={{ color: "#eab308" }} />
              {t("compose.cannotEncrypt")}
            </h3>
            <p className="compose-dialog__pgp-dialog-desc">
              {t("compose.missingPgpKeys")}
            </p>
            <ul className="compose-dialog__pgp-dialog-list">
              {missingKeyRecipients.map((email) => (
                <li key={email} className="compose-dialog__pgp-dialog-item">
                  <AlertTriangle size={12} style={{ color: "#eab308" }} />
                  {email}
                </li>
              ))}
            </ul>
            <div className="compose-dialog__pgp-dialog-actions">
              <button
                onClick={() => setShowMissingKeyDialog(false)}
                className="compose-dialog__pgp-dialog-cancel"
              >
                {t("compose.cancel")}
              </button>
              <button
                onClick={() => {
                  setShowMissingKeyDialog(false);
                  setPgpEncrypt(false);
                  handleSend();
                }}
                className="compose-dialog__pgp-dialog-confirm"
              >
                {t("compose.sendUnencrypted")}
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
  const { t } = useTranslation();
  const toText = to.map((r) => r.name ?? r.email).join(", ");

  return (
    <button
      type="button"
      onClick={onMaximize}
      className="compose-dialog__minimized"
    >
      <span className="compose-dialog__minimized-subject">
        {subject || t("compose.newMessage")}
      </span>
      {toText && (
        <span className="compose-dialog__minimized-to">
          {toText}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="compose-dialog__minimized-close"
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
  const { t } = useTranslation();
  if (saveError) {
    return (
      <span className="compose-dialog__save-indicator compose-dialog__save-indicator--error">
        {t("compose.saveFailed")}
      </span>
    );
  }
  if (saving) {
    return (
      <span className="compose-dialog__save-indicator compose-dialog__save-indicator--saving">
        <Loader2 size={10} className="animate-spin" />
        {t("compose.saving")}
      </span>
    );
  }
  if (lastSaved) {
    return (
      <span className="compose-dialog__save-indicator compose-dialog__save-indicator--saved">
        <Check size={10} />
        {t("compose.savedAt", { time: format(lastSaved, "h:mm a") })}
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
