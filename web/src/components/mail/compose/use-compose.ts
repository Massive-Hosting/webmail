/** Compose opener hook - extracted for code splitting */

import { useCallback } from "react";
import {
  useComposeStore,
  type DraftState,
  type ComposeMode,
  type WindowMode,
  generateDraftId,
} from "@/stores/compose-store.ts";
import type { Email, Identity, EmailAddress } from "@/types/mail.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";

interface OpenComposeOptions {
  mode: ComposeMode;
  email?: Email | null;
  identity?: Identity | null;
  windowMode?: WindowMode;
  /** Pre-fill the body with AI-generated text (inserted before quoted text in replies) */
  prefillBody?: string;
  /** Pre-fill the To recipients */
  prefillTo?: Array<{ email: string; name?: string | null }>;
}

export function useCompose() {
  const openDraft = useComposeStore((s) => s.openDraft);
  const { findByRole } = useMailboxes();

  const open = useCallback(
    (options: OpenComposeOptions) => {
      const draftId = generateDraftId();
      const { mode, email, identity, windowMode = "inline", prefillBody, prefillTo } = options;

      // Pre-resolve mailbox IDs so auto-save always has them
      const draftsMailboxId = findByRole("drafts")?.id;
      const sentMailboxId = findByRole("sent")?.id;

      let subject = "";
      let bodyHTML = "";
      const to: Array<{ name: string | null; email: string; isValid: boolean }> = [];
      const cc: Array<{ name: string | null; email: string; isValid: boolean }> = [];
      let inReplyTo: string | undefined;
      let references: string[] | undefined;
      const attachments: DraftState["attachments"] = [];
      let showCc = false;

      // Add pre-filled To recipients
      if (prefillTo) {
        for (const r of prefillTo) {
          to.push({ name: r.name ?? null, email: r.email, isValid: true });
        }
      }

      if (email && (mode === "reply" || mode === "reply-all")) {
        // Reply / Reply-all
        const sender = email.replyTo?.[0] ?? email.from?.[0];
        if (sender) {
          to.push({ name: sender.name, email: sender.email, isValid: true });
        }

        if (mode === "reply-all") {
          // Add all To/Cc recipients minus our own identity
          const selfEmail = identity?.email?.toLowerCase();
          const allRecipients = [...(email.to ?? []), ...(email.cc ?? [])];
          for (const r of allRecipients) {
            if (r.email.toLowerCase() === selfEmail) continue;
            if (to.some((t) => t.email.toLowerCase() === r.email.toLowerCase())) continue;
            cc.push({ name: r.name, email: r.email, isValid: true });
          }
          if (cc.length > 0) showCc = true;
        }

        subject = email.subject.startsWith("Re:")
          ? email.subject
          : `Re: ${email.subject}`;

        // Build quoted body
        const senderDisplay = email.from?.[0]
          ? `${email.from[0].name ?? email.from[0].email}`
          : "someone";
        const date = new Date(email.receivedAt).toLocaleString();
        const originalBody = getEmailBodyHTML(email);
        bodyHTML = `<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0 8px 0;"><div class="compose-quoted-text" style="border-left: 4px solid var(--color-border-primary, #d6d3d1); padding-left: 12px; margin-top: 8px; color: var(--color-text-secondary, #78716C);">
<p style="margin: 0 0 4px 0; font-size: 12px;">On ${date}, ${senderDisplay} wrote:</p>
${originalBody}
</div>`;

        // Threading headers
        const messageIdHeader = email.headers?.find(
          (h) => h.name.toLowerCase() === "message-id",
        );
        if (messageIdHeader) {
          inReplyTo = messageIdHeader.value.trim();
          const refsHeader = email.headers?.find(
            (h) => h.name.toLowerCase() === "references",
          );
          references = refsHeader
            ? [...refsHeader.value.trim().split(/\s+/), inReplyTo]
            : [inReplyTo];
        }
      } else if (email && mode === "forward") {
        subject = email.subject.startsWith("Fwd:")
          ? email.subject
          : `Fwd: ${email.subject}`;

        const senderDisplay = email.from?.[0]
          ? formatAddr(email.from[0])
          : "unknown";
        const toDisplay = email.to?.map(formatAddr).join(", ") ?? "";
        const date = new Date(email.receivedAt).toLocaleString();
        const originalBody = getEmailBodyHTML(email);

        bodyHTML = `<p><br></p><p><br></p><div style="border-top: 1px solid #ccc; padding-top: 12px; margin-top: 16px;">
<p><strong>---------- Forwarded message ----------</strong></p>
<p>From: ${senderDisplay}<br>
Date: ${date}<br>
Subject: ${email.subject}<br>
To: ${toDisplay}</p>
${originalBody}
</div>`;

        // Include original attachments as forwarded references
        if (email.attachments) {
          for (const att of email.attachments) {
            if (att.disposition === "inline") continue;
            attachments.push({
              id: `fwd-${att.blobId ?? att.partId}`,
              blobId: att.blobId ?? undefined,
              name: att.name ?? "attachment",
              type: att.type,
              size: att.size,
              progress: 100,
              status: "complete",
              isForwarded: true,
              included: true,
            });
          }
        }
      }

      // Insert AI-generated prefill body before quoted text
      if (prefillBody) {
        if (mode === "reply" || mode === "reply-all") {
          bodyHTML = `${prefillBody}${bodyHTML}`;
        } else {
          bodyHTML = prefillBody;
        }
      } else if (mode === "reply" || mode === "reply-all") {
        // No prefill — add a blank line for the user to type in
        bodyHTML = `<p><br></p>${bodyHTML}`;
      }

      // Insert signature if identity has one
      if (identity?.htmlSignature) {
        const sigSeparator = '<p>-- </p>';
        if (mode === "reply" || mode === "reply-all" || mode === "forward") {
          // bodyHTML starts with <p><br></p><p><br></p><hr>...[quote]
          // Find the HR/quote boundary and insert signature before it
          const hrIdx = bodyHTML.indexOf("<hr");
          const quoteIdx = bodyHTML.indexOf('<div class="compose-quoted-text');
          const boundary = hrIdx !== -1 ? hrIdx : (quoteIdx !== -1 ? quoteIdx : -1);
          if (boundary !== -1) {
            const before = bodyHTML.slice(0, boundary);
            const after = bodyHTML.slice(boundary);
            bodyHTML = `${before}${sigSeparator}${identity.htmlSignature}${after}`;
          } else {
            bodyHTML = `<p><br></p>${sigSeparator}${identity.htmlSignature}${bodyHTML}`;
          }
        } else {
          bodyHTML = `<p><br></p>${sigSeparator}${identity.htmlSignature}`;
        }
      }

      openDraft({
        draftId,
        composeMode: mode,
        windowMode,
        from: identity ?? null,
        to,
        cc,
        bcc: [],
        showCc,
        showBcc: false,
        subject,
        bodyHTML,
        bodyText: "",
        attachments,
        inReplyTo,
        references,
        draftsMailboxId,
        sentMailboxId,
      });

      return draftId;
    },
    [openDraft, findByRole],
  );

  return { open };
}

function formatAddr(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function getEmailBodyHTML(email: Email): string {
  if (email.htmlBody && email.bodyValues) {
    for (const part of email.htmlBody) {
      if (part.partId && email.bodyValues[part.partId]) {
        return email.bodyValues[part.partId].value;
      }
    }
  }
  if (email.textBody && email.bodyValues) {
    for (const part of email.textBody) {
      if (part.partId && email.bodyValues[part.partId]) {
        const text = email.bodyValues[part.partId].value;
        return `<pre style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(text)}</pre>`;
      }
    }
  }
  return "<p>(no content)</p>";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
