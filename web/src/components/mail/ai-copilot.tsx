/** AI Copilot slide-out panel — conversational AI assistant for email context */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { X, Sparkles, Send, Loader2, RotateCcw } from "lucide-react";
import { composeWithAI } from "@/api/ai.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { useMessage } from "@/hooks/use-message.ts";
import { useUIStore } from "@/stores/ui-store.ts";
import { useTranslation } from "react-i18next";
import type { Email } from "@/types/mail.ts";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isDraft?: boolean;
}

interface ContextDivider {
  type: "context-divider";
  subject: string;
  id: string;
}

type ConversationItem = Message | ContextDivider;

function isContextDivider(item: ConversationItem): item is ContextDivider {
  return "type" in item && item.type === "context-divider";
}

interface AICopilotProps {
  open: boolean;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  { key: "ai.suggestExplain", text: "Explain this email" },
  { key: "ai.suggestSummarize", text: "Summarize key points" },
  { key: "ai.suggestActionItems", text: "Extract action items" },
  { key: "ai.suggestDraftReply", text: "Draft a reply" },
  { key: "ai.suggestTranslate", text: "Translate to Norwegian" },
  { key: "ai.suggestDeadlines", text: "Find deadlines" },
] as const;

export const AICopilot = React.memo(function AICopilot({
  open,
  onClose,
}: AICopilotProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastEmailIdRef = useRef<string | null>(null);
  const { open: openCompose } = useCompose();

  const selectedEmailId = useUIStore((s) => s.selectedEmailId);
  const { email } = useMessage(selectedEmailId);

  // Track email context changes
  useEffect(() => {
    if (!selectedEmailId) return;
    if (lastEmailIdRef.current && lastEmailIdRef.current !== selectedEmailId && items.length > 0) {
      const subject = email?.subject ?? "";
      setItems((prev) => [
        ...prev,
        {
          type: "context-divider" as const,
          subject,
          id: `divider-${Date.now()}`,
        },
      ]);
    }
    lastEmailIdRef.current = selectedEmailId;
  }, [selectedEmailId, email?.subject, items.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // Listen for pre-filled prompts from smart reply buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        handleSend(detail.message);
      }
    };
    window.addEventListener("copilot-send", handler);
    return () => window.removeEventListener("copilot-send", handler);
  }, [handleSend]);

  const getEmailBodyText = useCallback((email: Email): string => {
    if (email.bodyValues) {
      if (email.textBody) {
        for (const part of email.textBody) {
          if (part.partId && email.bodyValues[part.partId]) {
            return email.bodyValues[part.partId].value;
          }
        }
      }
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
  }, []);

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = (messageText ?? input).trim();
      if (!text || isGenerating || !email) return;

      // Clear input
      if (!messageText) setInput("");

      // Add user message
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setItems((prev) => [...prev, userMsg, assistantMsg]);
      setIsGenerating(true);

      // Cancel any previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const sender = email.from?.[0]
          ? email.from[0].name ?? email.from[0].email
          : "unknown";
        const bodyText = getEmailBodyText(email);

        // Build conversation history from existing messages (not dividers)
        const messages = items.filter(
          (item): item is Message => !isContextDivider(item),
        );
        const conversationContext = messages
          .map((m) =>
            m.role === "user"
              ? `User: ${m.content}`
              : `Assistant: ${m.content}`,
          )
          .join("\n\n");

        const contextPrompt = `Email from: ${sender}\nSubject: ${email.subject}\n\n${bodyText}`;
        const systemPrompt =
          "You are an email assistant. The user is viewing an email and asking questions or requesting actions. Be helpful, concise, and context-aware. When asked to draft a reply, write the full email body.";

        const fullPrompt = conversationContext
          ? `${contextPrompt}\n\n${conversationContext}\n\nUser: ${text}`
          : `${contextPrompt}\n\nUser: ${text}`;

        const stream = composeWithAI(
          systemPrompt,
          fullPrompt,
          "professional",
          controller.signal,
        );

        let result = "";
        for await (const chunk of stream) {
          result += chunk;
          setItems((prev) =>
            prev.map((item) =>
              !isContextDivider(item) && item.id === assistantId
                ? { ...item, content: result }
                : item,
            ),
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("AI Copilot error:", err);
        setItems((prev) =>
          prev.map((item) =>
            !isContextDivider(item) && item.id === assistantId
              ? { ...item, content: t("ai.errorGenerating") }
              : item,
          ),
        );
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [input, isGenerating, email, items, getEmailBodyText, t],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleUseAsReply = useCallback(
    (content: string) => {
      if (!email) return;
      const htmlBody = content
        .split("\n\n")
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
      openCompose({
        mode: "reply",
        email,
        prefillBody: htmlBody,
      });
    },
    [email, openCompose],
  );

  const handleNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setInput("");
    setIsGenerating(false);
  }, []);

  const handleChipClick = useCallback(
    (prompt: string) => {
      handleSend(prompt);
    },
    [handleSend],
  );

  const hasMessages = items.filter((i) => !isContextDivider(i)).length > 0;
  const senderName = email?.from?.[0]?.name ?? email?.from?.[0]?.email ?? "";

  return (
    <div
      className="ai-copilot-panel"
      style={{
        position: "relative",
        width: open ? 360 : 0,
        minWidth: open ? 360 : 0,
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderLeft: open ? "1px solid var(--color-border-primary)" : "none",
        backgroundColor: "var(--color-bg-elevated)",
        boxShadow: open ? "var(--shadow-elevated, -4px 0 12px rgba(0,0,0,0.08))" : "none",
        transition: "width 250ms ease-out, min-width 250ms ease-out",
      }}
      aria-label={t("ai.copilotTitle")}
      role="complementary"
    >
      {open && (
        <>
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 shrink-0"
            style={{
              height: 48,
              borderBottom: "1px solid var(--color-border-primary)",
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles
                size={16}
                style={{ color: "var(--color-text-accent)" }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {t("ai.copilotTitle")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {hasMessages && (
                <button
                  onClick={handleNewConversation}
                  className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: "var(--color-text-secondary)" }}
                  aria-label={t("ai.newConversation")}
                  title={t("ai.newConversation")}
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label={t("ai.closePanel")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Context bar */}
          {email && (
            <div
              className="px-4 py-2 text-xs truncate shrink-0"
              style={{
                color: "var(--color-text-secondary)",
                borderBottom: "1px solid var(--color-border-secondary)",
              }}
            >
              {t("ai.copilotContext", { subject: email.subject })}
            </div>
          )}

          {/* Conversation area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{ scrollBehavior: "smooth" }}
          >
            {!hasMessages && email && (
              /* Welcome + suggested prompts */
              <div className="flex flex-col items-center pt-6">
                <Sparkles
                  size={32}
                  style={{ color: "var(--color-text-accent)", opacity: 0.6 }}
                />
                <p
                  className="text-sm font-medium mt-3 mb-1"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {t("ai.copilotWelcome")}
                </p>
                {senderName && (
                  <p
                    className="text-xs mb-4"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {t("ai.copilotContext", { subject: email.subject })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.key}
                      onClick={() => handleChipClick(t(prompt.key))}
                      disabled={isGenerating}
                      className="px-3 py-1.5 text-xs rounded-full transition-all duration-150"
                      style={{
                        color: "var(--color-text-primary)",
                        border: "1px solid var(--color-border-primary)",
                        backgroundColor: "var(--color-bg-primary)",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-text-accent)";
                        e.currentTarget.style.color = "var(--color-text-accent)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border-primary)";
                        e.currentTarget.style.color = "var(--color-text-primary)";
                      }}
                    >
                      {t(prompt.key)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!email && !hasMessages && (
              <div className="flex flex-col items-center pt-6">
                <Sparkles
                  size={32}
                  style={{ color: "var(--color-text-secondary)", opacity: 0.4 }}
                />
                <p
                  className="text-sm mt-3 text-center"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {t("readingPane.selectMessage")}
                </p>
              </div>
            )}

            {/* Message bubbles */}
            {items.map((item) => {
              if (isContextDivider(item)) {
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 my-4"
                  >
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: "var(--color-border-secondary)" }}
                    />
                    <span
                      className="text-[10px] shrink-0"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {t("ai.contextChanged")}
                    </span>
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: "var(--color-border-secondary)" }}
                    />
                  </div>
                );
              }

              const isUser = item.role === "user";
              // Show "Use as reply" on all AI messages that have meaningful content
              const showUseAsReply = !isUser && item.content.length > 30;

              return (
                <div
                  key={item.id}
                  className={`flex mb-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="rounded-xl px-3 py-2 max-w-[85%]"
                    style={{
                      fontSize: 14,
                      lineHeight: 1.5,
                      backgroundColor: isUser
                        ? "var(--color-bg-accent)"
                        : "var(--color-bg-tertiary)",
                      color: isUser
                        ? "#fff"
                        : "var(--color-text-primary)",
                      border: isUser ? "none" : "1px solid var(--color-border-primary)",
                      wordBreak: "break-word",
                    }}
                  >
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {item.content || (
                        <span className="flex items-center gap-1.5">
                          <Loader2 size={14} className="animate-spin" />
                          {t("ai.generating")}
                        </span>
                      )}
                    </div>
                    {showUseAsReply && !isGenerating && (
                      <button
                        onClick={() => handleUseAsReply(item.content)}
                        className="mt-2 px-2.5 py-1 text-xs rounded-md transition-colors"
                        style={{
                          color: "var(--color-text-accent)",
                          backgroundColor: "var(--color-bg-primary)",
                          border: "1px solid var(--color-border-primary)",
                        }}
                      >
                        {t("ai.useAsReply")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input area */}
          <div
            className="shrink-0 px-3 py-3"
            style={{
              borderTop: "1px solid var(--color-border-primary)",
            }}
          >
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border-primary)",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent text-sm"
                style={{
                  color: "var(--color-text-primary)",
                  outline: "none",
                  border: "none",
                  boxShadow: "none",
                }}
                placeholder={t("ai.copilotPlaceholder")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!email || isGenerating}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || !email || isGenerating}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                style={{
                  color:
                    input.trim() && email && !isGenerating
                      ? "var(--color-text-accent)"
                      : "var(--color-text-secondary)",
                  opacity: input.trim() && email && !isGenerating ? 1 : 0.4,
                }}
                aria-label={t("compose.send")}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

/** Check if text looks like an email draft (has greeting-like pattern) */
function looksLikeEmailDraft(text: string): boolean {
  const greetings = /^(hi|hello|hey|dear|good morning|good afternoon|greetings|hei|hallo|sehr geehrte)/im;
  const signoffs = /(best regards|kind regards|sincerely|thanks|cheers|regards|med vennlig hilsen|mit freundlichen grüßen|vennlig hilsen|mvh)\s*[,.]?\s*$/im;
  return greetings.test(text) || signoffs.test(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
