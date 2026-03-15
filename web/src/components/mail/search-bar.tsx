/** Search bar with visual dropdown — quick filters, recent searches, and narrowing chips */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  Clock,
  Mail,
  Star,
  Paperclip,
  CalendarDays,
  ArrowRight,
  User,
  AtSign,
  FileText,
} from "lucide-react";
import { useSearchStore } from "@/stores/search-store.ts";

interface SearchBarProps {
  onAdvancedSearch?: () => void;
}

/** Quick filter definitions */
const QUICK_FILTERS = [
  { label: "Unread", query: "is:unread", icon: Mail },
  { label: "Starred", query: "has:star", icon: Star },
  { label: "Has attachments", query: "has:attachment", icon: Paperclip },
  { label: "This week", query: () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `after:${d.toISOString().slice(0, 10)}`;
  }, icon: CalendarDays },
] as const;

function getFilterQuery(filter: typeof QUICK_FILTERS[number]): string {
  return typeof filter.query === "function" ? filter.query() : filter.query;
}

/** Narrowing chip definitions — shown when the user types free text */
const NARROW_OPTIONS = [
  { label: "From", prefix: "from:", icon: User },
  { label: "To", prefix: "to:", icon: AtSign },
  { label: "Subject", prefix: "subject:", icon: FileText },
] as const;

export const SearchBar = React.memo(function SearchBar({
  onAdvancedSearch,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const query = useSearchStore((s) => s.query);
  const isSearchActive = useSearchStore((s) => s.isSearchActive);
  const recentSearches = useSearchStore((s) => s.recentSearches);
  const scopeToMailbox = useSearchStore((s) => s.scopeToMailbox);
  const setQuery = useSearchStore((s) => s.setQuery);
  const executeSearch = useSearchStore((s) => s.executeSearch);
  const clearSearch = useSearchStore((s) => s.clearSearch);
  const removeRecentSearch = useSearchStore((s) => s.removeRecentSearch);
  const setScopeToMailbox = useSearchStore((s) => s.setScopeToMailbox);

  // Sync local query from store when cleared externally
  useEffect(() => {
    if (!isSearchActive && query === "") {
      setLocalQuery("");
    }
  }, [isSearchActive, query]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (value.trim().length === 0) {
        clearSearch();
        return;
      }

      debounceRef.current = setTimeout(() => {
        setQuery(value);
      }, 300);
    },
    [setQuery, clearSearch],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (localQuery.trim()) {
        executeSearch(localQuery);
        setShowSuggestions(false);
      }
    },
    [localQuery, executeSearch],
  );

  const handleClear = useCallback(() => {
    setLocalQuery("");
    clearSearch();
    inputRef.current?.focus();
  }, [clearSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (localQuery) {
          handleClear();
        } else {
          inputRef.current?.blur();
          setShowSuggestions(false);
        }
        e.stopPropagation();
      }
    },
    [localQuery, handleClear],
  );

  const handleFocus = useCallback(() => {
    setShowSuggestions(true);
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setShowSuggestions(false);
      setIsFocused(false);
    }, 200);
  }, []);

  const handleSuggestionClick = useCallback(
    (value: string) => {
      setLocalQuery(value);
      executeSearch(value);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [executeSearch],
  );

  const handleQuickFilterClick = useCallback(
    (filter: typeof QUICK_FILTERS[number]) => {
      const q = getFilterQuery(filter);
      setLocalQuery(q);
      executeSearch(q);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [executeSearch],
  );

  const handleNarrowClick = useCallback(
    (prefix: string) => {
      const trimmed = localQuery.trim();
      const newQuery = `${prefix}${trimmed}`;
      setLocalQuery(newQuery);
      executeSearch(newQuery);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [localQuery, executeSearch],
  );

  // Determine if query is plain text (no operators)
  const isPlainText = useMemo(() => {
    const trimmed = localQuery.trim();
    if (!trimmed) return false;
    return !/^(from|to|subject|has|is|in|before|after|larger|smaller):/i.test(trimmed);
  }, [localQuery]);

  // Filtered recent searches
  const filteredRecent = useMemo(() => {
    if (!localQuery.trim()) return recentSearches.slice(0, 5);
    const lower = localQuery.toLowerCase();
    return recentSearches
      .filter((s) => s.toLowerCase().includes(lower))
      .slice(0, 5);
  }, [localQuery, recentSearches]);

  const hasQuery = localQuery.trim().length > 0;

  const showDropdown =
    showSuggestions &&
    (recentSearches.length > 0 || !hasQuery);
  // Also show dropdown when typing
  const showDropdownFinal = showSuggestions && (showDropdown || hasQuery);

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-xl relative">
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150"
          style={{ color: isFocused ? "var(--color-text-accent)" : "var(--color-text-tertiary)" }}
        />
        <input
          ref={inputRef}
          id="search-input"
          type="text"
          value={localQuery}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search messages... (/ to focus)"
          className="w-full h-8 pl-9 pr-20 text-sm outline-none"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: isFocused ? "1px solid var(--color-border-focus)" : "1px solid transparent",
            borderRadius: "var(--radius-md)",
            boxShadow: isFocused ? "0 0 0 3px rgba(59, 130, 246, 0.08)" : "none",
            transition: "border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease",
          }}
        />

        {/* Right side buttons */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {localQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md hover:bg-[var(--color-bg-secondary)] transition-colors duration-150"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Clear search (Esc)"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onAdvancedSearch}
            className="p-1 rounded-md hover:bg-[var(--color-bg-secondary)] transition-colors duration-150"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Advanced search"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Scope to mailbox toggle */}
      {isSearchActive && (
        <div className="absolute left-0 -bottom-6 flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--color-text-tertiary)" }}>
            <input
              type="checkbox"
              checked={scopeToMailbox}
              onChange={(e) => setScopeToMailbox(e.target.checked)}
              className="w-3 h-3"
            />
            Current mailbox only
          </label>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showDropdownFinal && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 top-full mt-1.5 overflow-hidden z-50 animate-fade-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-lg, 12px)",
            maxHeight: 380,
            overflowY: "auto",
          }}
        >
          {/* === EMPTY STATE: no query typed === */}
          {!hasQuery && (
            <>
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="py-1.5">
                  <div
                    className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Recent searches
                  </div>
                  {recentSearches.slice(0, 5).map((search) => (
                    <div
                      key={search}
                      className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 group cursor-pointer"
                    >
                      <Clock size={14} style={{ color: "var(--color-text-tertiary)" }} />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSuggestionClick(search)}
                        className="flex-1 text-left truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {search}
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => removeRecentSearch(search)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-[var(--color-bg-secondary)] transition-all duration-150"
                        style={{ color: "var(--color-text-tertiary)" }}
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick filters */}
              <div
                className="px-3 py-2"
                style={{
                  borderTop: recentSearches.length > 0 ? "1px solid var(--color-border-primary)" : undefined,
                }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Quick filters
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_FILTERS.map((filter) => {
                    const Icon = filter.icon;
                    return (
                      <button
                        key={filter.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleQuickFilterClick(filter)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
                        style={{
                          color: "var(--color-text-secondary)",
                          border: "1px solid var(--color-border-primary)",
                          backgroundColor: "var(--color-bg-secondary)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                          e.currentTarget.style.borderColor = "var(--color-border-focus)";
                          e.currentTarget.style.color = "var(--color-text-accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
                          e.currentTarget.style.borderColor = "var(--color-border-primary)";
                          e.currentTarget.style.color = "var(--color-text-secondary)";
                        }}
                      >
                        <Icon size={12} />
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* === TYPING STATE: query has content === */}
          {hasQuery && (
            <>
              {/* Search for "X" — main action */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSuggestionClick(localQuery.trim())}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-primary)" }}
              >
                <Search size={14} style={{ color: "var(--color-text-accent)" }} />
                <span>
                  Search for{" "}
                  <span className="font-semibold" style={{ color: "var(--color-text-accent)" }}>
                    &ldquo;{localQuery.trim()}&rdquo;
                  </span>
                </span>
                <ArrowRight size={13} className="ml-auto" style={{ color: "var(--color-text-tertiary)" }} />
              </button>

              {/* Narrow your search — only for plain text */}
              {isPlainText && (
                <div
                  className="px-3 py-2"
                  style={{ borderTop: "1px solid var(--color-border-primary)" }}
                >
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Narrow your search
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {NARROW_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.prefix}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleNarrowClick(opt.prefix)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
                          style={{
                            color: "var(--color-text-secondary)",
                            border: "1px solid var(--color-border-primary)",
                            backgroundColor: "var(--color-bg-secondary)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
                            e.currentTarget.style.borderColor = "var(--color-border-focus)";
                            e.currentTarget.style.color = "var(--color-text-accent)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)";
                            e.currentTarget.style.borderColor = "var(--color-border-primary)";
                            e.currentTarget.style.color = "var(--color-text-secondary)";
                          }}
                        >
                          <Icon size={12} />
                          {opt.label}: {localQuery.trim()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Filtered recent searches */}
              {filteredRecent.length > 0 && (
                <div
                  className="py-1.5"
                  style={{ borderTop: "1px solid var(--color-border-primary)" }}
                >
                  <div
                    className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Recent
                  </div>
                  {filteredRecent.map((search) => (
                    <div
                      key={search}
                      className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 group cursor-pointer"
                    >
                      <Clock size={14} style={{ color: "var(--color-text-tertiary)" }} />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSuggestionClick(search)}
                        className="flex-1 text-left truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {search}
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => removeRecentSearch(search)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-[var(--color-bg-secondary)] transition-all duration-150"
                        style={{ color: "var(--color-text-tertiary)" }}
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
});
