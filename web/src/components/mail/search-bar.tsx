/** Search bar with suggestions dropdown and debounced search — premium design */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Search, X, SlidersHorizontal, Clock, Sparkles } from "lucide-react";
import { useSearchStore } from "@/stores/search-store.ts";
import { SEARCH_SYNTAX_HINTS } from "@/lib/search-parser.ts";

interface SearchBarProps {
  onAdvancedSearch?: () => void;
}

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

      // Debounce the actual search
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
    // Delay to allow click on suggestion
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

  const handleSyntaxClick = useCallback(
    (prefix: string) => {
      const newQuery = localQuery ? `${localQuery} ${prefix}` : prefix;
      setLocalQuery(newQuery);
      inputRef.current?.focus();
    },
    [localQuery],
  );

  // Filter syntax hints based on current input
  const currentWord = localQuery.split(/\s+/).pop() ?? "";
  const matchingHints = currentWord
    ? SEARCH_SYNTAX_HINTS.filter((h) =>
        h.prefix.toLowerCase().startsWith(currentWord.toLowerCase()),
      )
    : [];

  const showDropdown =
    showSuggestions &&
    (recentSearches.length > 0 || matchingHints.length > 0 || !localQuery);

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
      {showDropdown && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 top-full mt-1.5 overflow-hidden z-50 animate-scale-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-md)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {/* Syntax hints */}
          {matchingHints.length > 0 && (
            <div>
              <div
                className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Search operators
              </div>
              {matchingHints.map((hint) => (
                <button
                  key={hint.prefix}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSyntaxClick(hint.prefix)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <Sparkles size={13} style={{ color: "var(--color-text-accent)" }} />
                  <span className="font-mono text-xs font-medium" style={{ color: "var(--color-text-accent)" }}>
                    {hint.prefix}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {hint.description}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Show all hints when input is empty */}
          {!localQuery && (
            <div>
              <div
                className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Search operators
              </div>
              {SEARCH_SYNTAX_HINTS.slice(0, 6).map((hint) => (
                <button
                  key={hint.prefix}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSyntaxClick(hint.prefix)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <Sparkles size={13} style={{ color: "var(--color-text-accent)" }} />
                  <span className="font-mono text-xs font-medium" style={{ color: "var(--color-text-accent)" }}>
                    {hint.prefix}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {hint.description}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div>
              <div
                className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider flex items-center justify-between"
                style={{
                  color: "var(--color-text-tertiary)",
                  borderTop: matchingHints.length > 0 || !localQuery ? "1px solid var(--color-border-primary)" : undefined,
                }}
              >
                Recent searches
              </div>
              {recentSearches.slice(0, 8).map((search) => (
                <div
                  key={search}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 group"
                >
                  <Clock size={13} style={{ color: "var(--color-text-tertiary)" }} />
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
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Advanced search link */}
          {onAdvancedSearch && (
            <div
              style={{ borderTop: "1px solid var(--color-border-primary)" }}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowSuggestions(false);
                  onAdvancedSearch();
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 font-medium"
                style={{ color: "var(--color-text-accent)" }}
              >
                <SlidersHorizontal size={13} />
                Advanced search...
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
});
