/** Smart Reply Bar — shown below email in reading pane when AI is enabled */

import React, { useState, useCallback, useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { replyWithAI, type AITone } from "@/api/ai.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import type { Email } from "@/types/mail.ts";

interface SmartReplyBarProps {
  email: Email;
}

const REPLY_OPTIONS: { tone: AITone; label: string }[] = [
  { tone: "professional", label: "Reply professionally" },
  { tone: "friendly", label: "Reply friendly" },
  { tone: "concise", label: "Reply briefly" },
];

export const SmartReplyBar = React.memo(function SmartReplyBar({
  email,
}: SmartReplyBarProps) {
  const [loadingTone, setLoadingTone] = useState<AITone | null>(null);
  const { open: openCompose } = useCompose();
  const abortRef = useRef<AbortController | null>(null);

  const getEmailBodyText = useCallback((): string => {
    if (email.bodyValues) {
      // Try text body first
      if (email.textBody) {
        for (const part of email.textBody) {
          if (part.partId && email.bodyValues[part.partId]) {
            return email.bodyValues[part.partId].value;
          }
        }
      }
      // Fall back to HTML body (strip tags)
      if (email.htmlBody) {
        for (const part of email.htmlBody) {
          if (part.partId && email.bodyValues[part.partId]) {
            const html = email.bodyValues[part.partId].value;
            const div = document.createElement("div");
            div.innerHTML = html;
            return div.textContent ?? "";
          }
        }
      }
    }
    return email.preview;
  }, [email]);

  const handleSmartReply = useCallback(
    async (tone: AITone) => {
      setLoadingTone(tone);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const bodyText = getEmailBodyText();
        const stream = replyWithAI(bodyText, tone, undefined, controller.signal);

        let result = "";
        for await (const chunk of stream) {
          result += chunk;
        }

        if (result) {
          // Convert plain text to simple HTML paragraphs
          const htmlBody = result
            .split("\n\n")
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
            .join("");

          openCompose({
            mode: "reply",
            email,
            prefillBody: htmlBody,
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Smart reply failed:", err);
      } finally {
        setLoadingTone(null);
        abortRef.current = null;
      }
    },
    [email, getEmailBodyText, openCompose],
  );

  return (
    <div className="smart-reply-bar">
      <Sparkles size={14} className="smart-reply-bar__icon" />
      {REPLY_OPTIONS.map(({ tone, label }) => (
        <button
          key={tone}
          type="button"
          onClick={() => handleSmartReply(tone)}
          disabled={loadingTone !== null}
          className="smart-reply-bar__btn"
        >
          {loadingTone === tone ? (
            <Loader2 size={13} className="animate-spin" />
          ) : null}
          {label}
        </button>
      ))}
    </div>
  );
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
