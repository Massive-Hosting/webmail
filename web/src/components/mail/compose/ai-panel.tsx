/** AI Compose Assistant Panel — inline panel in compose dialog */

import React, { useState, useRef, useCallback } from "react";
import { Sparkles, Loader2, X, Check, RotateCcw } from "lucide-react";
import { composeWithAI, replyWithAI, type AITone } from "@/api/ai.ts";
import { useTranslation } from "react-i18next";

interface AIPanelProps {
  /** Whether the compose is a reply (includes original email context) */
  isReply: boolean;
  /** Original email body text for reply context */
  originalEmailBody?: string;
  /** Called when user wants to insert generated text into the editor */
  onInsert: (text: string) => void;
  /** Called to close the panel */
  onClose: () => void;
}

export const AIPanel = React.memo(function AIPanel({
  isReply,
  originalEmailBody,
  onInsert,
  onClose,
}: AIPanelProps) {
  const { t } = useTranslation();
  const TONES: { value: AITone; label: string }[] = [
    { value: "professional", label: t("ai.professional") },
    { value: "friendly", label: t("ai.friendly") },
    { value: "concise", label: t("ai.concise") },
  ];
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<AITone>("professional");
  const [generatedText, setGeneratedText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !isReply) return;

    setIsGenerating(true);
    setGeneratedText("");
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let stream: AsyncGenerator<string, void, undefined>;

      if (isReply && originalEmailBody) {
        stream = replyWithAI(
          originalEmailBody,
          tone,
          prompt.trim() || undefined,
          controller.signal,
        );
      } else {
        stream = composeWithAI(prompt, "", tone, controller.signal);
      }

      let accumulated = "";
      for await (const chunk of stream) {
        accumulated += chunk;
        setGeneratedText(accumulated);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
        return;
      }
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [prompt, tone, isReply, originalEmailBody]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleDiscard = useCallback(() => {
    setGeneratedText("");
    setError(null);
    setPrompt("");
    textareaRef.current?.focus();
  }, []);

  const handleInsert = useCallback(() => {
    if (generatedText) {
      onInsert(generatedText);
      setGeneratedText("");
      setPrompt("");
      onClose();
    }
  }, [generatedText, onInsert, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  return (
    <div className="ai-panel">
      <div className="ai-panel__header">
        <div className="ai-panel__header-title">
          <Sparkles size={14} />
          <span>{t("ai.assistant")}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ai-panel__close-btn"
          title={t("ai.closePanel")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="ai-panel__body">
        {/* Prompt input */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isReply
              ? t("ai.promptReply")
              : t("ai.promptCompose")
          }
          className="ai-panel__prompt"
          rows={2}
          disabled={isGenerating}
        />

        {/* Tone selector */}
        <div className="ai-panel__tone-row">
          <span className="ai-panel__tone-label">{t("ai.tone")}</span>
          <div className="ai-panel__tone-options">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={`ai-panel__tone-btn ${
                  tone === t.value ? "ai-panel__tone-btn--active" : ""
                }`}
                disabled={isGenerating}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate / Cancel button */}
        <div className="ai-panel__actions-top">
          {isGenerating ? (
            <button
              type="button"
              onClick={handleCancel}
              className="ai-panel__cancel-btn"
            >
              <X size={14} />
              {t("compose.cancel")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() && !isReply}
              className="ai-panel__generate-btn"
            >
              <Sparkles size={14} />
              {t("ai.generate")}
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="ai-panel__error">
            {error}
          </div>
        )}

        {/* Streaming response area */}
        {(generatedText || isGenerating) && (
          <div className="ai-panel__result">
            <div className="ai-panel__result-text">
              {generatedText || (
                <span className="ai-panel__result-placeholder">
                  <Loader2 size={14} className="animate-spin" />
                  {t("ai.generating")}
                </span>
              )}
            </div>

            {/* Insert / Discard buttons */}
            {generatedText && !isGenerating && (
              <div className="ai-panel__actions-bottom">
                <button
                  type="button"
                  onClick={handleInsert}
                  className="ai-panel__insert-btn"
                >
                  <Check size={14} />
                  {t("ai.insertIntoEmail")}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="ai-panel__discard-btn"
                >
                  <RotateCcw size={14} />
                  {t("ai.discard")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
