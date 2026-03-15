/** Smart Reply Bar — AI action bar shown below email in reading pane */

import React, { useState, useCallback, useRef } from "react";
import { Sparkles, Loader2, MessageSquare, Send } from "lucide-react";
import { replyWithAI, composeWithAI, type AITone } from "@/api/ai.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { useTranslation } from "react-i18next";
import { AIResponseCard } from "@/components/mail/ai-response-card.tsx";
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
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [aiResponseText, setAIResponseText] = useState("");
  const [showAIInput, setShowAIInput] = useState(false);
  const [aiInputValue, setAIInputValue] = useState("");
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

  const handleSummarize = useCallback(async () => {
    if (isGenerating) return;

    // Cancel any previous request
    abortRef.current?.abort();

    setShowSummary(true);
    setShowAIResponse(false);
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

  const handleAskAI = useCallback(async (question: string) => {
    if (!question.trim() || isGenerating) return;

    // Cancel any previous request
    abortRef.current?.abort();

    setShowAIResponse(true);
    setShowSummary(false);
    setShowAIInput(false);
    setAIResponseText("");
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const bodyText = getEmailBodyText();
      const userPrompt = `User request: ${question}\n\nEmail:\n${bodyText}`;
      const stream = composeWithAI(
        "You are an email assistant. The user has a question or request about the email below. Respond concisely.",
        userPrompt,
        "professional",
        controller.signal,
      );

      let result = "";
      for await (const chunk of stream) {
        result += chunk;
        setAIResponseText(result);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Ask AI failed:", err);
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [getEmailBodyText, isGenerating]);

  const handleAIInputSubmit = useCallback(() => {
    handleAskAI(aiInputValue);
  }, [aiInputValue, handleAskAI]);

  const handleAIInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAIInputSubmit();
      }
      if (e.key === "Escape") {
        setShowAIInput(false);
        setAIInputValue("");
      }
    },
    [handleAIInputSubmit],
  );

  const closeSummary = useCallback(() => {
    abortRef.current?.abort();
    setShowSummary(false);
    setSummaryText("");
    setIsGenerating(false);
  }, []);

  const closeAIResponse = useCallback(() => {
    abortRef.current?.abort();
    setShowAIResponse(false);
    setAIResponseText("");
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

      {showAIResponse && (
        <AIResponseCard title={t("ai.aiResponse")} onClose={closeAIResponse}>
          <div className="ai-response-card__text">
            {aiResponseText || (
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

        {/* Ask AI button / inline input */}
        {showAIInput ? (
          <div className="smart-reply-bar__input-wrapper">
            <input
              type="text"
              className="smart-reply-bar__input"
              placeholder={t("ai.askPlaceholder")}
              value={aiInputValue}
              onChange={(e) => setAIInputValue(e.target.value)}
              onKeyDown={handleAIInputKeyDown}
              autoFocus
            />
            <button
              type="button"
              className="smart-reply-bar__input-submit"
              onClick={handleAIInputSubmit}
              disabled={!aiInputValue.trim() || isGenerating}
            >
              <Send size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAIInput(true)}
            disabled={isDisabled}
            className="smart-reply-bar__btn"
          >
            {isGenerating && showAIResponse ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <MessageSquare size={13} />
            )}
            {t("ai.askAI")}
          </button>
        )}
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
