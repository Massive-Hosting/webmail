/** Search bar with suggestions dropdown and debounced search */

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
  }, []);

  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
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
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--color-text-tertiary)" }}
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
          className="w-full h-8 pl-9 pr-20 text-sm rounded-md outline-none transition-colors duration-150"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: "1px solid transparent",
          }}
          onMouseOver={(e) => {
            if (document.activeElement !== e.currentTarget) {
              e.currentTarget.style.borderColor = "var(--color-border-secondary)";
            }
          }}
          onMouseOut={(e) => {
            if (document.activeElement !== e.currentTarget) {
              e.currentTarget.style.borderColor = "transparent";
            }
          }}
        />

        {/* Right side buttons */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {localQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded hover:bg-[var(--color-bg-secondary)] transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Clear search (Esc)"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onAdvancedSearch}
            className="p-1 rounded hover:bg-[var(--color-bg-secondary)] transition-colors"
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
          <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--color-text-tertiary)" }}>
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
          className="absolute left-0 right-0 top-full mt-1 rounded-md overflow-hidden z-50"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {/* Syntax hints */}
          {matchingHints.length > 0 && (
            <div>
              <div
                className="px-3 py-1.5 text-xs font-medium"
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
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <Sparkles size={14} style={{ color: "var(--color-text-accent)" }} />
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-accent)" }}>
                    {hint.prefix}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
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
                className="px-3 py-1.5 text-xs font-medium"
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
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <Sparkles size={14} style={{ color: "var(--color-text-accent)" }} />
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-accent)" }}>
                    {hint.prefix}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
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
                className="px-3 py-1.5 text-xs font-medium flex items-center justify-between"
                style={{
                  color: "var(--color-text-tertiary)",
                  borderTop: matchingHints.length > 0 || !localQuery ? "1px solid var(--color-border-secondary)" : undefined,
                }}
              >
                Recent searches
              </div>
              {recentSearches.slice(0, 8).map((search) => (
                <div
                  key={search}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors group"
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
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--color-bg-secondary)] transition-all"
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
              style={{ borderTop: "1px solid var(--color-border-secondary)" }}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowSuggestions(false);
                  onAdvancedSearch();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-accent)" }}
              >
                <SlidersHorizontal size={14} />
                Advanced search...
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
});
