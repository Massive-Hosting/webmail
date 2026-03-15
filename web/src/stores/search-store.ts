/** Search state store */

import { create } from "zustand";

const MAX_RECENT_SEARCHES = 20;
const RECENT_SEARCHES_KEY = "recentSearches";

function loadRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_RECENT_SEARCHES);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveRecentSearches(searches: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    // ignore
  }
}

interface SearchState {
  /** Current search query text */
  query: string;
  /** Whether search is actively showing results */
  isSearchActive: boolean;
  /** Recent search queries */
  recentSearches: string[];
  /** Whether to scope search to current mailbox */
  scopeToMailbox: boolean;

  // Actions
  setQuery: (query: string) => void;
  executeSearch: (query: string) => void;
  clearSearch: () => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  setScopeToMailbox: (scoped: boolean) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  isSearchActive: false,
  recentSearches: loadRecentSearches(),
  scopeToMailbox: false,

  setQuery: (query) => {
    set({ query });
    if (query.trim().length > 0) {
      set({ isSearchActive: true });
    }
  },

  executeSearch: (query) => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;

    set({ query: trimmed, isSearchActive: true });

    // Add to recent searches
    const current = get().recentSearches;
    const filtered = current.filter((s) => s !== trimmed);
    const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    set({ recentSearches: updated });
    saveRecentSearches(updated);
  },

  clearSearch: () => {
    set({ query: "", isSearchActive: false });
  },

  removeRecentSearch: (query) => {
    const updated = get().recentSearches.filter((s) => s !== query);
    set({ recentSearches: updated });
    saveRecentSearches(updated);
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
    saveRecentSearches([]);
  },

  setScopeToMailbox: (scoped) => {
    set({ scopeToMailbox: scoped });
  },
}));
