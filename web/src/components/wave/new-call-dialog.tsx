/** New Wave Call dialog — search contacts/directory or type an email to start a call */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Phone, Video, X, Search, Users, BookUser, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { searchContacts } from "@/api/contacts.ts";
import { searchDirectory, type DirectoryEntry } from "@/api/availability.ts";

interface Recipient {
  email: string;
  name: string;
  source: "contact" | "directory" | "manual";
}

interface NewCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRecipient: (email: string, name: string) => void;
}

export const NewCallDialog = React.memo(function NewCallDialog({
  open,
  onOpenChange,
  onSelectRecipient,
}: NewCallDialogProps) {
  const { t } = useTranslation();
  const userEmail = useAuthStore((s) => s.email);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [contacts, directory] = await Promise.all([
          searchContacts(query).catch(() => []),
          searchDirectory(query, 10).catch(() => [] as DirectoryEntry[]),
        ]);

        const seen = new Set<string>();
        const merged: Recipient[] = [];

        // Add contacts first
        for (const c of (contacts ?? [])) {
          const email = c.emails?.[0]?.address;
          if (!email || email === userEmail) continue;
          const key = email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({
            email,
            name: c.name?.full || email.split("@")[0],
            source: "contact",
          });
        }

        // Add directory entries (same-tenant colleagues)
        for (const d of (directory ?? [])) {
          const key = d.email.toLowerCase();
          if (seen.has(key) || d.email === userEmail) continue;
          seen.add(key);
          merged.push({
            email: d.email,
            name: d.name || d.email.split("@")[0],
            source: "directory",
          });
        }

        setResults(merged.slice(0, 15));
        setSelectedIdx(0);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [query, userEmail]);

  const handleSelect = useCallback(
    (recipient: Recipient) => {
      onOpenChange(false);
      onSelectRecipient(recipient.email, recipient.name);
    },
    [onOpenChange, onSelectRecipient],
  );

  // Allow calling a raw email address
  const handleManualCall = useCallback(() => {
    const email = query.trim();
    if (!email || !email.includes("@")) return;
    onOpenChange(false);
    onSelectRecipient(email, email.split("@")[0]);
  }, [query, onOpenChange, onSelectRecipient]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIdx]) {
          handleSelect(results[selectedIdx]);
        } else if (query.includes("@")) {
          handleManualCall();
        }
      }
    },
    [results, selectedIdx, handleSelect, handleManualCall, query],
  );

  const isValidEmail = query.trim().includes("@") && query.trim().length > 3;
  const showManualOption = isValidEmail && !results.some((r) => r.email.toLowerCase() === query.trim().toLowerCase());

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 animate-fade-in"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full rounded-xl animate-scale-in overflow-hidden flex flex-col"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-xl)",
            maxWidth: 720,
            height: 640,
            maxHeight: "88vh",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
              >
                <Phone size={18} className="text-white" />
              </div>
              <div>
                <Dialog.Title
                  className="text-base font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {t("wave.newCall")}
                </Dialog.Title>
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {t("wave.newCallDescription")}
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Search input */}
          <div className="px-5 pt-4 pb-2">
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors focus-within:ring-2 focus-within:ring-[var(--color-border-focus)]/30 focus-within:border-[var(--color-border-focus)]"
              style={{
                backgroundColor: "var(--color-input-bg)",
                border: "1px solid var(--color-border-primary)",
              }}
            >
              <Search size={16} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("wave.searchPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--color-text-primary)" }}
                autoComplete="off"
              />
              {searching && (
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: "var(--color-border-secondary)",
                    borderTopColor: "var(--color-text-accent)",
                  }}
                />
              )}
            </div>
          </div>

          {/* Results */}
          <div
            className="px-3 pt-1 pb-3 overflow-y-auto flex-1 min-h-0"
          >
            {results.length === 0 && !showManualOption && query.length >= 2 && !searching && (
              <div
                className="text-center py-8 text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {t("wave.noResults")}
              </div>
            )}

            {results.map((r, idx) => (
              <button
                key={r.email}
                onClick={() => handleSelect(r)}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{
                  backgroundColor: idx === selectedIdx ? "var(--color-bg-tertiary)" : "transparent",
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <Avatar address={{ name: r.name, email: r.email }} size={36} />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {r.name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {r.email}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.source === "contact" ? (
                    <BookUser size={14} style={{ color: "var(--color-text-secondary)" }} />
                  ) : (
                    <Users size={14} style={{ color: "var(--color-text-secondary)" }} />
                  )}
                </div>
              </button>
            ))}

            {showManualOption && (() => {
              const targetEmail = query.trim();
              const targetDomain = targetEmail.split("@")[1]?.toLowerCase();
              const isExternal = targetDomain !== userEmail.split("@")[1]?.toLowerCase();
              return (
                <button
                  onClick={handleManualCall}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    backgroundColor: results.length === 0 && selectedIdx === 0 ? "var(--color-bg-tertiary)" : "transparent",
                  }}
                >
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                    style={{
                      backgroundColor: isExternal ? "rgba(99,102,241,0.1)" : "var(--color-bg-tertiary)",
                      border: `1px solid ${isExternal ? "rgba(99,102,241,0.2)" : "var(--color-border-primary)"}`,
                    }}
                  >
                    {isExternal
                      ? <Send size={16} style={{ color: "#6366f1" }} />
                      : <Phone size={16} style={{ color: "var(--color-text-accent)" }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {isExternal
                        ? t("wave.inviteExternal", { email: targetEmail })
                        : t("wave.callEmail", { email: targetEmail })
                      }
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {isExternal ? t("wave.sendInviteHint") : t("wave.directCall")}
                    </div>
                  </div>
                </button>
              );
            })()}
          </div>

          {/* Footer hint */}
          <div
            className="flex items-center justify-center gap-4 px-5 py-3 text-xs"
            style={{
              borderTop: "1px solid var(--color-border-secondary)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span className="flex items-center gap-1">
              <kbd
                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  border: "1px solid var(--color-border-primary)",
                }}
              >
                ↑↓
              </kbd>
              {t("wave.navigate")}
            </span>
            <span className="flex items-center gap-1">
              <kbd
                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  border: "1px solid var(--color-border-primary)",
                }}
              >
                ↵
              </kbd>
              {t("wave.select")}
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
