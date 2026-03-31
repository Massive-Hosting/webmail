/** Chip-based recipient input for To/Cc/Bcc fields with contact autocomplete */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { X, UserPlus, UserCog, Copy, Trash2 } from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { Recipient } from "@/stores/compose-store.ts";
import {
  useContactSearch,
  getContactDisplayName,
  getFrequentContacts,
} from "@/hooks/use-contacts.ts";
import type { Contact } from "@/types/contacts.ts";
import { getAvatarColor } from "@/lib/format.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/stores/ui-store.ts";
import { toast } from "sonner";

interface RecipientInputProps {
  label: string;
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  placeholder?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AutocompleteSuggestion {
  id: string;
  name: string;
  email: string;
  contact?: Contact;
}

export const RecipientInput = React.memo(function RecipientInput({
  label,
  recipients,
  onChange,
  placeholder = "Add recipients...",
}: RecipientInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Contact search (debounced 200ms)
  const { results: contactResults } = useContactSearch(inputValue, inputValue.length >= 1);

  // Build suggestion list
  const suggestions = useMemo((): AutocompleteSuggestion[] => {
    const seen = new Set<string>();
    const result: AutocompleteSuggestion[] = [];

    // Exclude already-added recipients
    const existingEmails = new Set(
      recipients.map((r) => r.email.toLowerCase()),
    );

    // If no input yet, show frequent contacts
    if (!inputValue) {
      const frequent = getFrequentContacts();
      for (const f of frequent.slice(0, 5)) {
        if (existingEmails.has(f.email.toLowerCase())) continue;
        if (seen.has(f.email.toLowerCase())) continue;
        seen.add(f.email.toLowerCase());
        result.push({
          id: `freq-${f.email}`,
          name: f.name ?? f.email,
          email: f.email,
        });
      }
      return result;
    }

    // Contact results
    for (const contact of contactResults) {
      for (const email of contact.emails) {
        if (existingEmails.has(email.address.toLowerCase())) continue;
        if (seen.has(email.address.toLowerCase())) continue;
        seen.add(email.address.toLowerCase());
        result.push({
          id: `${contact.id}-${email.address}`,
          name: getContactDisplayName(contact),
          email: email.address,
          contact,
        });
      }
    }

    // Also check frequent contacts
    if (inputValue.length >= 1) {
      const q = inputValue.toLowerCase();
      const frequent = getFrequentContacts();
      for (const f of frequent) {
        if (existingEmails.has(f.email.toLowerCase())) continue;
        if (seen.has(f.email.toLowerCase())) continue;
        const match =
          f.email.toLowerCase().includes(q) ||
          f.name?.toLowerCase().includes(q);
        if (match) {
          seen.add(f.email.toLowerCase());
          result.push({
            id: `freq-${f.email}`,
            name: f.name ?? f.email,
            email: f.email,
          });
        }
      }
    }

    return result.slice(0, 10);
  }, [inputValue, contactResults, recipients]);

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions.length]);

  /** Parse an email string into a Recipient */
  const parseRecipient = useCallback((raw: string): Recipient | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Try "Name <email>" format
    const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
      return {
        name: match[1].trim(),
        email: match[2].trim(),
        isValid: EMAIL_REGEX.test(match[2].trim()),
      };
    }

    return {
      name: null,
      email: trimmed,
      isValid: EMAIL_REGEX.test(trimmed),
    };
  }, []);

  /** Add a suggestion as a recipient */
  const selectSuggestion = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      const exists = recipients.some(
        (r) => r.email.toLowerCase() === suggestion.email.toLowerCase(),
      );
      if (!exists) {
        onChange([
          ...recipients,
          {
            name: suggestion.name !== suggestion.email ? suggestion.name : null,
            email: suggestion.email,
            isValid: EMAIL_REGEX.test(suggestion.email),
          },
        ]);
      }
      setInputValue("");
      setShowDropdown(false);
      inputRef.current?.focus();
    },
    [recipients, onChange],
  );

  /** Add current input as a chip */
  const confirmInput = useCallback(() => {
    const raw = inputValue.trim();
    if (!raw) {
      setShowDropdown(false);
      return;
    }

    // Split by comma, semicolon, or newline
    const parts = raw.split(/[,;\n]+/);
    const newRecipients: Recipient[] = [];

    for (const part of parts) {
      const r = parseRecipient(part);
      if (r) {
        // Don't add duplicates
        const exists = recipients.some(
          (existing) => existing.email.toLowerCase() === r.email.toLowerCase(),
        );
        if (!exists) {
          newRecipients.push(r);
        }
      }
    }

    if (newRecipients.length > 0) {
      onChange([...recipients, ...newRecipients]);
    }
    setInputValue("");
    setShowDropdown(false);
  }, [inputValue, recipients, onChange, parseRecipient]);

  /** Handle paste of multiple addresses */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text/plain");
      if (text.includes(",") || text.includes(";") || text.includes("\n")) {
        e.preventDefault();
        const parts = text.split(/[,;\n]+/);
        const newRecipients: Recipient[] = [];
        for (const part of parts) {
          const r = parseRecipient(part);
          if (r) {
            const exists = recipients.some(
              (existing) => existing.email.toLowerCase() === r.email.toLowerCase(),
            );
            if (!exists && !newRecipients.some((n) => n.email.toLowerCase() === r.email.toLowerCase())) {
              newRecipients.push(r);
            }
          }
        }
        if (newRecipients.length > 0) {
          onChange([...recipients, ...newRecipients]);
        }
      }
    },
    [recipients, onChange, parseRecipient],
  );

  /** Remove a recipient chip */
  const removeRecipient = useCallback(
    (index: number) => {
      const updated = [...recipients];
      updated.splice(index, 1);
      onChange(updated);
    },
    [recipients, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showDropdown && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          return;
        }
        if (e.key === "Enter" && suggestions[highlightedIndex]) {
          e.preventDefault();
          selectSuggestion(suggestions[highlightedIndex]);
          return;
        }
      }

      if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
        if (inputValue.trim()) {
          e.preventDefault();
          confirmInput();
        }
      } else if (e.key === "Backspace" && !inputValue && recipients.length > 0) {
        removeRecipient(recipients.length - 1);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [
      inputValue, recipients, confirmInput, removeRecipient,
      showDropdown, suggestions, highlightedIndex, selectSuggestion,
    ],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
  }, []);

  const handleFocus = useCallback(() => {
    setShowDropdown(true);
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Delay to allow clicking dropdown items
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (dropdownRef.current?.contains(relatedTarget)) return;

    setTimeout(() => {
      setShowDropdown(false);
      if (inputValue.trim()) {
        confirmInput();
      }
    }, 150);
  }, [inputValue, confirmInput]);

  return (
    <div
      className="flex items-start gap-2 px-4 py-1.5 relative"
      style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
    >
      <label
        className="text-xs font-medium pt-1.5 shrink-0 w-8"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </label>
      <div
        ref={containerRef}
        className="flex flex-wrap items-center gap-1 flex-1 min-h-[32px] cursor-text relative"
        onClick={() => inputRef.current?.focus()}
      >
        {recipients.map((r, i) => (
          <RecipientChip
            key={`${r.email}-${i}`}
            recipient={r}
            onRemove={() => removeRecipient(i)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={recipients.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent py-1 pl-2"
          style={{ color: "var(--color-text-primary)" }}
          autoComplete="off"
        />

        {/* Autocomplete dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 top-full z-50 w-full mt-1 py-1 rounded-md shadow-lg max-h-[240px] overflow-y-auto"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-primary)",
            }}
          >
            {suggestions.map((suggestion, index) => (
              <AutocompleteItem
                key={suggestion.id}
                suggestion={suggestion}
                isHighlighted={index === highlightedIndex}
                onSelect={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/** Single autocomplete suggestion item */
function AutocompleteItem({
  suggestion,
  isHighlighted,
  onSelect,
  onMouseEnter,
}: {
  suggestion: AutocompleteSuggestion;
  isHighlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const avatarColor = getAvatarColor(suggestion.email);
  const initials = suggestion.name
    ? suggestion.name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
    : suggestion.email[0]?.toUpperCase() ?? "?";

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        backgroundColor: isHighlighted ? "var(--color-bg-tertiary)" : "transparent",
      }}
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent blur
        onSelect();
      }}
      onMouseEnter={onMouseEnter}
    >
      {/* Mini avatar */}
      <div
        className="inline-flex items-center justify-center rounded-full text-white font-medium shrink-0 overflow-hidden"
        style={{
          width: 24,
          height: 24,
          backgroundColor: suggestion.contact?.avatar?.blobId ? undefined : avatarColor,
          fontSize: 10,
        }}
      >
        {suggestion.contact?.avatar?.blobId ? (
          <img
            src={`/api/blob/${suggestion.contact.avatar.blobId}/inline`}
            alt={suggestion.name}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Name and email */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {suggestion.name}
        </div>
        {suggestion.name !== suggestion.email && (
          <div
            className="text-xs truncate"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {suggestion.email}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipientChip({
  recipient,
  onRemove,
}: {
  recipient: Recipient;
  onRemove: () => void;
}) {
  const displayText = recipient.name || recipient.email;
  const isInvalid = !recipient.isValid;
  const queryClient = useQueryClient();
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Look up contact from cached data (no network request)
  const matchingContact = useMemo(() => {
    const cachedContacts = queryClient.getQueryData<Contact[]>(["contacts"]);
    if (!cachedContacts) return null;
    return cachedContacts.find((c) =>
      c.emails.some((e) => e.address.toLowerCase() === recipient.email.toLowerCase()),
    ) ?? null;
  }, [queryClient, recipient.email]);

  const handleCopyEmail = useCallback(() => {
    navigator.clipboard.writeText(recipient.email).then(() => {
      toast.success("Email address copied");
    });
  }, [recipient.email]);

  const handleEditContact = useCallback(() => {
    if (matchingContact) {
      setActiveView("contacts");
      // Store the contact ID to select after navigating
      sessionStorage.setItem("selectContactId", matchingContact.id);
    }
  }, [matchingContact, setActiveView]);

  const handleAddContact = useCallback(() => {
    setActiveView("contacts");
    // Store email to pre-fill in new contact form
    sessionStorage.setItem("newContactEmail", recipient.email);
    if (recipient.name) {
      sessionStorage.setItem("newContactName", recipient.name);
    }
  }, [setActiveView, recipient.email, recipient.name]);

  const itemClassName = "flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150";
  const itemStyle = { color: "var(--color-text-primary)", borderRadius: "var(--radius-sm)" };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full max-w-[200px]"
          style={{
            backgroundColor: isInvalid
              ? "var(--color-bg-error, #fee2e2)"
              : "var(--color-bg-tertiary)",
            color: isInvalid
              ? "var(--color-text-error, #dc2626)"
              : "var(--color-text-primary)",
            border: isInvalid
              ? "1px solid var(--color-border-error, #fca5a5)"
              : "1px solid var(--color-border-primary)",
          }}
          title={recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email}
        >
          <span className="truncate">{displayText}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="shrink-0 hover:opacity-70"
            style={{ color: "inherit" }}
          >
            <X size={12} />
          </button>
        </span>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[180px] p-1 text-sm animate-scale-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-md)",
            zIndex: 50,
          }}
        >
          {matchingContact ? (
            <ContextMenu.Item
              className={itemClassName}
              style={itemStyle}
              onSelect={handleEditContact}
            >
              <UserCog size={14} />
              Edit contact
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Item
              className={itemClassName}
              style={itemStyle}
              onSelect={handleAddContact}
            >
              <UserPlus size={14} />
              Add to contacts
            </ContextMenu.Item>
          )}

          <ContextMenu.Item
            className={itemClassName}
            style={itemStyle}
            onSelect={handleCopyEmail}
          >
            <Copy size={14} />
            Copy email address
          </ContextMenu.Item>

          <ContextMenu.Separator
            className="my-1"
            style={{ borderTop: "1px solid var(--color-border-primary)" }}
          />

          <ContextMenu.Item
            className={itemClassName}
            style={{ color: "var(--color-text-error, #dc2626)", borderRadius: "var(--radius-sm)" }}
            onSelect={onRemove}
          >
            <Trash2 size={14} />
            Remove
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
