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

interface OpenComposeOptions {
  mode: ComposeMode;
  email?: Email | null;
  identity?: Identity | null;
  windowMode?: WindowMode;
  /** Pre-fill the body with AI-generated text (inserted before quoted text in replies) */
  prefillBody?: string;
}

export function useCompose() {
  const openDraft = useComposeStore((s) => s.openDraft);

  const open = useCallback(
    (options: OpenComposeOptions) => {
      const draftId = generateDraftId();
      const { mode, email, identity, windowMode = "inline", prefillBody } = options;

      let subject = "";
      let bodyHTML = "";
      const to: Array<{ name: string | null; email: string; isValid: boolean }> = [];
      const cc: Array<{ name: string | null; email: string; isValid: boolean }> = [];
      let inReplyTo: string | undefined;
      let references: string[] | undefined;
      const attachments: DraftState["attachments"] = [];
      let showCc = false;

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
        bodyHTML = `<p><br></p><p><br></p><div style="border-left: 3px solid #ccc; padding-left: 12px; margin-top: 16px; color: #555;">
<p>On ${date}, ${senderDisplay} wrote:</p>
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
      }

      // Insert signature if identity has one
      if (identity?.htmlSignature) {
        const sigSeparator = '<p>-- </p>';
        if (mode === "reply" || mode === "reply-all" || mode === "forward") {
          // Insert signature above quoted text
          bodyHTML = `<p><br></p>${sigSeparator}${identity.htmlSignature}${bodyHTML}`;
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
      });

      return draftId;
    },
    [openDraft],
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
