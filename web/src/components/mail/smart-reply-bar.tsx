/** Smart Reply Bar — AI action bar shown below email in reading pane */

import React, { useState, useCallback, useRef } from "react";
import { Sparkles, Loader2, MessageSquare } from "lucide-react";
import { replyWithAI, composeWithAI, type AITone } from "@/api/ai.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { useTranslation } from "react-i18next";
import { AIResponseCard } from "@/components/mail/ai-response-card.tsx";
import { useUIStore } from "@/stores/ui-store.ts";
import type { Email } from "@/types/mail.ts";

interface SmartReplyBarProps {
  email: Email;
}

export const SmartReplyBar = React.memo(function SmartReplyBar({
  email,
}: SmartReplyBarProps) {
  const { t } = useTranslation();
  const [loadingTone, setLoadingTone] = useState<AITone | null>(null);
  const { open: openCompose } = useCompose();
  const abortRef = useRef<AbortController | null>(null);

  // AI action state
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const REPLY_OPTIONS: { tone: AITone; label: string }[] = [
    { tone: "professional", label: t("ai.replyProfessionally") },
    { tone: "friendly", label: t("ai.replyFriendly") },
    { tone: "concise", label: t("ai.replyBriefly") },
  ];

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
      // Open copilot with a pre-filled reply prompt
      const toneLabel = tone === "professional" ? t("ai.replyProfessionally") : tone === "friendly" ? t("ai.replyFriendly") : t("ai.replyBriefly");
      useUIStore.getState().setCopilotOpen(true);
      // Small delay to let copilot mount, then trigger the message
      setTimeout(() => {
        const event = new CustomEvent("copilot-send", { detail: { message: `${toneLabel}` } });
        window.dispatchEvent(event);
      }, 400);
      setLoadingTone(null);
      return;

      // Legacy direct reply code (kept for reference)
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

  const handleSummarize = useCallback(async () => {
    if (isGenerating) return;

    // Cancel any previous request
    abortRef.current?.abort();

    setShowSummary(true);
    setSummaryText("");
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const bodyText = getEmailBodyText();
      const stream = composeWithAI(
        "Summarize the following email in 2-3 concise bullet points. Be brief and clear.",
        bodyText,
        "concise",
        controller.signal,
      );

      let result = "";
      for await (const chunk of stream) {
        result += chunk;
        setSummaryText(result);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Summarize failed:", err);
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [getEmailBodyText, isGenerating]);

  const closeSummary = useCallback(() => {
    abortRef.current?.abort();
    setShowSummary(false);
    setSummaryText("");
    setIsGenerating(false);
  }, []);

  const isDisabled = loadingTone !== null || isGenerating;

  return (
    <div className="smart-reply-container">
      {/* AI Response Cards */}
      {showSummary && (
        <AIResponseCard title={t("ai.summary")} onClose={closeSummary}>
          <div className="ai-response-card__text">
            {summaryText || (
              <span className="ai-response-card__generating">
                <Loader2 size={14} className="animate-spin" />
                {t("ai.generating")}
              </span>
            )}
          </div>
        </AIResponseCard>
      )}

      {/* Action Bar */}
      <div className="smart-reply-bar">
        <Sparkles size={14} className="smart-reply-bar__icon" />

        {/* Reply buttons */}
        {REPLY_OPTIONS.map(({ tone, label }) => (
          <button
            key={tone}
            type="button"
            onClick={() => handleSmartReply(tone)}
            disabled={isDisabled}
            className="smart-reply-bar__btn"
          >
            {loadingTone === tone ? (
              <Loader2 size={13} className="animate-spin" />
            ) : null}
            {label}
          </button>
        ))}

        {/* Divider */}
        <span className="smart-reply-bar__divider" />

        {/* Summarize button */}
        <button
          type="button"
          onClick={handleSummarize}
          disabled={isDisabled}
          className="smart-reply-bar__btn"
        >
          {isGenerating && showSummary ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          {t("ai.summarize")}
        </button>

        {/* Ask AI button — opens copilot panel */}
        <button
          type="button"
          onClick={() => useUIStore.getState().setCopilotOpen(true)}
          disabled={isDisabled}
          className="smart-reply-bar__btn"
        >
          <MessageSquare size={13} />
          {t("ai.askAI")}
        </button>
      </div>
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
