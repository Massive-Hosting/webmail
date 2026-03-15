/** Advanced search dialog with form-based filter builder */

import React, { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Search } from "lucide-react";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useSearchStore } from "@/stores/search-store.ts";

interface AdvancedSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  from: string;
  to: string;
  subject: string;
  hasAttachment: boolean;
  isUnread: boolean;
  isRead: boolean;
  isStarred: boolean;
  afterDate: string;
  beforeDate: string;
  inMailbox: string;
  text: string;
}

const INITIAL_STATE: FormState = {
  from: "",
  to: "",
  subject: "",
  hasAttachment: false,
  isUnread: false,
  isRead: false,
  isStarred: false,
  afterDate: "",
  beforeDate: "",
  inMailbox: "",
  text: "",
};

/** Convert form values into a structured query string */
function formToQueryString(form: FormState): string {
  const parts: string[] = [];

  if (form.from.trim()) {
    const val = form.from.includes(" ") ? `"${form.from}"` : form.from;
    parts.push(`from:${val}`);
  }
  if (form.to.trim()) {
    const val = form.to.includes(" ") ? `"${form.to}"` : form.to;
    parts.push(`to:${val}`);
  }
  if (form.subject.trim()) {
    const val = form.subject.includes(" ") ? `"${form.subject}"` : form.subject;
    parts.push(`subject:${val}`);
  }
  if (form.hasAttachment) parts.push("has:attachment");
  if (form.isStarred) parts.push("has:star");
  if (form.isUnread) parts.push("is:unread");
  if (form.isRead) parts.push("is:read");
  if (form.afterDate) parts.push(`after:${form.afterDate}`);
  if (form.beforeDate) parts.push(`before:${form.beforeDate}`);
  if (form.inMailbox) parts.push(`in:${form.inMailbox}`);
  if (form.text.trim()) parts.push(form.text.trim());

  return parts.join(" ");
}

export const AdvancedSearchDialog = React.memo(function AdvancedSearchDialog({
  open,
  onOpenChange,
}: AdvancedSearchProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const executeSearch = useSearchStore((s) => s.executeSearch);
  const { sortedMailboxes } = useMailboxes();

  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const queryString = formToQueryString(form);
      if (queryString.trim()) {
        executeSearch(queryString);
        onOpenChange(false);
      }
    },
    [form, executeSearch, onOpenChange],
  );

  const handleReset = useCallback(() => {
    setForm(INITIAL_STATE);
  }, []);

  const inputStyle = {
    backgroundColor: "var(--color-bg-tertiary)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-primary)",
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg w-full max-w-lg p-6"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-xl)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Advanced Search
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* From */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                From
              </label>
              <input
                type="text"
                value={form.from}
                onChange={(e) => updateField("from", e.target.value)}
                placeholder="Sender email or name"
                className="w-full h-8 px-3 text-sm rounded-md outline-none"
                style={inputStyle}
              />
            </div>

            {/* To */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                To
              </label>
              <input
                type="text"
                value={form.to}
                onChange={(e) => updateField("to", e.target.value)}
                placeholder="Recipient email or name"
                className="w-full h-8 px-3 text-sm rounded-md outline-none"
                style={inputStyle}
              />
            </div>

            {/* Subject */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Subject
              </label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => updateField("subject", e.target.value)}
                placeholder="Subject contains"
                className="w-full h-8 px-3 text-sm rounded-md outline-none"
                style={inputStyle}
              />
            </div>

            {/* Keywords / body text */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Contains words
              </label>
              <input
                type="text"
                value={form.text}
                onChange={(e) => updateField("text", e.target.value)}
                placeholder="Search in message body"
                className="w-full h-8 px-3 text-sm rounded-md outline-none"
                style={inputStyle}
              />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  After
                </label>
                <input
                  type="date"
                  value={form.afterDate}
                  onChange={(e) => updateField("afterDate", e.target.value)}
                  className="w-full h-8 px-3 text-sm rounded-md outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Before
                </label>
                <input
                  type="date"
                  value={form.beforeDate}
                  onChange={(e) => updateField("beforeDate", e.target.value)}
                  className="w-full h-8 px-3 text-sm rounded-md outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Mailbox selector */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                In mailbox
              </label>
              <select
                value={form.inMailbox}
                onChange={(e) => updateField("inMailbox", e.target.value)}
                className="w-full h-8 px-3 text-sm rounded-md outline-none"
                style={inputStyle}
              >
                <option value="">All mailboxes</option>
                {sortedMailboxes.map((mb) => (
                  <option key={mb.id} value={mb.name.toLowerCase()}>
                    {mb.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-4">
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={form.hasAttachment}
                  onChange={(e) => updateField("hasAttachment", e.target.checked)}
                />
                Has attachment
              </label>
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={form.isUnread}
                  onChange={(e) => updateField("isUnread", e.target.checked)}
                />
                Unread
              </label>
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={form.isRead}
                  onChange={(e) => updateField("isRead", e.target.checked)}
                />
                Read
              </label>
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={form.isStarred}
                  onChange={(e) => updateField("isStarred", e.target.checked)}
                />
                Starred
              </label>
            </div>

            {/* Actions */}
            <div
              className="flex items-center justify-between pt-3"
              style={{ borderTop: "1px solid var(--color-border-secondary)" }}
            >
              <button
                type="button"
                onClick={handleReset}
                className="text-sm px-3 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Reset
              </button>
              <div className="flex items-center gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="text-sm px-3 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md transition-colors font-medium"
                  style={{
                    backgroundColor: "var(--color-bg-accent)",
                    color: "var(--color-text-inverse)",
                  }}
                >
                  <Search size={14} />
                  Search
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
