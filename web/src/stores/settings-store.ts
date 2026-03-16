/** User preferences store — syncs with server via debounced PUT /api/settings */

import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type DensityMode = "comfortable" | "compact";
export type ReadingPanePosition = "right" | "bottom" | "off";
export type AutoAdvance = "next" | "previous" | "list";
export type MarkReadDelay = 0 | 2000 | -1; // 0=immediately, 2000=2s, -1=manually
export type UndoSendDelay = 0 | 5 | 10 | 30;
export type DefaultReplyMode = "reply" | "reply-all";
export type ExternalImages = "never" | "ask" | "always";
export type StartPage = "inbox" | "last";

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string; // HTML
}

export interface NotificationPrefs {
  enabled: boolean;
  sound: boolean;
}

export interface Preferences {
  theme: ThemeMode;
  density: DensityMode;
  startPage: StartPage;
  readingPane: ReadingPanePosition;
  conversationView: boolean;
  autoAdvance: AutoAdvance;
  markReadDelay: MarkReadDelay;
  undoSendDelay: UndoSendDelay;
  defaultReplyMode: DefaultReplyMode;
  externalImages: ExternalImages;
  keyboardShortcuts: boolean;
  notifications: NotificationPrefs;
  trustedImageDomains: string[];
  panelSizes: {
    sidebar: number;
    messageList: number;
  };
  folderColors: Record<string, string>;
  savedSearches: SavedSearch[];
  emailTemplates: EmailTemplate[];
}

const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  density: "comfortable",
  startPage: "inbox",
  readingPane: "right",
  conversationView: true,
  autoAdvance: "next",
  markReadDelay: 0,
  undoSendDelay: 5,
  defaultReplyMode: "reply",
  externalImages: "ask",
  keyboardShortcuts: true,
  notifications: {
    enabled: true,
    sound: false,
  },
  trustedImageDomains: [],
  panelSizes: {
    sidebar: 240,
    messageList: 380,
  },
  folderColors: {},
  savedSearches: [],
  emailTemplates: [],
};

interface SettingsState extends Preferences {
  /** Whether settings have been loaded from the server */
  loaded: boolean;
  /** Whether we're currently loading */
  loading: boolean;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
  setStartPage: (startPage: StartPage) => void;
  setReadingPane: (pos: ReadingPanePosition) => void;
  setConversationView: (on: boolean) => void;
  setAutoAdvance: (action: AutoAdvance) => void;
  setMarkReadDelay: (delay: MarkReadDelay) => void;
  setUndoSendDelay: (delay: UndoSendDelay) => void;
  setDefaultReplyMode: (mode: DefaultReplyMode) => void;
  setExternalImages: (mode: ExternalImages) => void;
  setKeyboardShortcuts: (enabled: boolean) => void;
  setNotifications: (prefs: Partial<NotificationPrefs>) => void;
  addTrustedImageDomain: (domain: string) => void;
  setPanelSizes: (sizes: Partial<Preferences["panelSizes"]>) => void;
  setFolderColor: (mailboxId: string, color: string | null) => void;
  addSavedSearch: (name: string, query: string) => void;
  removeSavedSearch: (id: string) => void;
  renameSavedSearch: (id: string, name: string) => void;
  addTemplate: (template: Omit<EmailTemplate, "id">) => void;
  updateTemplate: (id: string, updates: Partial<Omit<EmailTemplate, "id">>) => void;
  removeTemplate: (id: string) => void;

  /** Load preferences from server, merging with defaults */
  loadFromServer: () => Promise<void>;
  /** Reset all settings to defaults */
  resetToDefaults: () => void;
}

/** Read theme from localStorage for instant boot (no flash) */
function loadTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "system";
}

/** Read density from localStorage for instant boot */
function loadDensity(): DensityMode {
  try {
    const stored = localStorage.getItem("density");
    if (stored === "comfortable" || stored === "compact") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "comfortable";
}

/** Debounced server write */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveToServer(prefs: Preferences) {
  // Also cache to localStorage as write-ahead
  try {
    localStorage.setItem("settingsCache", JSON.stringify(prefs));
    localStorage.setItem("theme", prefs.theme);
    localStorage.setItem("density", prefs.density);
  } catch {
    // ignore
  }

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fetch("/api/settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => {
      // silently fail — write-ahead cache will retry on next load
    });
  }, 1000);
}

function getPreferences(state: SettingsState): Preferences {
  return {
    theme: state.theme,
    density: state.density,
    startPage: state.startPage,
    readingPane: state.readingPane,
    conversationView: state.conversationView,
    autoAdvance: state.autoAdvance,
    markReadDelay: state.markReadDelay,
    undoSendDelay: state.undoSendDelay,
    defaultReplyMode: state.defaultReplyMode,
    externalImages: state.externalImages,
    keyboardShortcuts: state.keyboardShortcuts,
    notifications: state.notifications,
    trustedImageDomains: state.trustedImageDomains,
    panelSizes: state.panelSizes,
    folderColors: state.folderColors,
    savedSearches: state.savedSearches,
    emailTemplates: state.emailTemplates,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_PREFERENCES,
  theme: loadTheme(),
  density: loadDensity(),
  loaded: false,
  loading: false,

  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    debouncedSaveToServer(getPreferences(get()));
  },

  setDensity: (density) => {
    set({ density });
    localStorage.setItem("density", density);
    applyDensity(density);
    debouncedSaveToServer(getPreferences(get()));
  },

  setStartPage: (startPage) => {
    set({ startPage });
    debouncedSaveToServer(getPreferences(get()));
  },

  setReadingPane: (readingPane) => {
    set({ readingPane });
    debouncedSaveToServer(getPreferences(get()));
  },

  setConversationView: (conversationView) => {
    set({ conversationView });
    debouncedSaveToServer(getPreferences(get()));
  },

  setAutoAdvance: (autoAdvance) => {
    set({ autoAdvance });
    debouncedSaveToServer(getPreferences(get()));
  },

  setMarkReadDelay: (markReadDelay) => {
    set({ markReadDelay });
    debouncedSaveToServer(getPreferences(get()));
  },

  setUndoSendDelay: (undoSendDelay) => {
    set({ undoSendDelay });
    debouncedSaveToServer(getPreferences(get()));
  },

  setDefaultReplyMode: (defaultReplyMode) => {
    set({ defaultReplyMode });
    debouncedSaveToServer(getPreferences(get()));
  },

  setExternalImages: (externalImages) => {
    set({ externalImages });
    debouncedSaveToServer(getPreferences(get()));
  },

  setKeyboardShortcuts: (keyboardShortcuts) => {
    set({ keyboardShortcuts });
    debouncedSaveToServer(getPreferences(get()));
  },

  setNotifications: (prefs) => {
    const current = get().notifications;
    const notifications = { ...current, ...prefs };
    set({ notifications });
    debouncedSaveToServer(getPreferences(get()));
  },

  addTrustedImageDomain: (domain) => {
    set((state) => ({
      trustedImageDomains: [...new Set([...state.trustedImageDomains, domain])],
    }));
    debouncedSaveToServer(getPreferences(get()));
  },

  setPanelSizes: (sizes) => {
    const current = get().panelSizes;
    const panelSizes = { ...current, ...sizes };
    set({ panelSizes });
    debouncedSaveToServer(getPreferences(get()));
  },

  setFolderColor: (mailboxId, color) => {
    const current = get().folderColors;
    const folderColors = { ...current };
    if (color === null) {
      delete folderColors[mailboxId];
    } else {
      folderColors[mailboxId] = color;
    }
    set({ folderColors });
    debouncedSaveToServer(getPreferences(get()));
  },

  addSavedSearch: (name, query) => {
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const savedSearches = [...get().savedSearches, { id, name, query }];
    set({ savedSearches });
    debouncedSaveToServer(getPreferences(get()));
  },

  removeSavedSearch: (id) => {
    const savedSearches = get().savedSearches.filter((s) => s.id !== id);
    set({ savedSearches });
    debouncedSaveToServer(getPreferences(get()));
  },

  renameSavedSearch: (id, name) => {
    const savedSearches = get().savedSearches.map((s) =>
      s.id === id ? { ...s, name } : s,
    );
    set({ savedSearches });
    debouncedSaveToServer(getPreferences(get()));
  },

  addTemplate: (template) => {
    const id = crypto.randomUUID();
    const emailTemplates = [...get().emailTemplates, { ...template, id }];
    set({ emailTemplates });
    debouncedSaveToServer(getPreferences(get()));
  },

  updateTemplate: (id, updates) => {
    const emailTemplates = get().emailTemplates.map((t) =>
      t.id === id ? { ...t, ...updates } : t,
    );
    set({ emailTemplates });
    debouncedSaveToServer(getPreferences(get()));
  },

  removeTemplate: (id) => {
    const emailTemplates = get().emailTemplates.filter((t) => t.id !== id);
    set({ emailTemplates });
    debouncedSaveToServer(getPreferences(get()));
  },

  loadFromServer: async () => {
    set({ loading: true });
    try {
      const response = await fetch("/api/settings", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      let serverPrefs: Partial<Preferences> = {};
      if (response.ok) {
        try {
          serverPrefs = await response.json();
        } catch {
          // empty or invalid JSON
        }
      }

      // Merge: server wins, but prefer localStorage for theme/density
      // (user may have changed them locally before server sync)
      const localTheme = localStorage.getItem("theme");
      const localDensity = localStorage.getItem("density");
      const merged: Preferences = {
        ...DEFAULT_PREFERENCES,
        ...serverPrefs,
        // If server has default value but localStorage has a user choice, prefer local
        theme: serverPrefs.theme ?? (localTheme as Preferences["theme"]) ?? DEFAULT_PREFERENCES.theme,
        density: serverPrefs.density ?? (localDensity as Preferences["density"]) ?? DEFAULT_PREFERENCES.density,
        notifications: {
          ...DEFAULT_PREFERENCES.notifications,
          ...(serverPrefs.notifications ?? {}),
        },
        panelSizes: {
          ...DEFAULT_PREFERENCES.panelSizes,
          ...(serverPrefs.panelSizes ?? {}),
        },
        folderColors: {
          ...DEFAULT_PREFERENCES.folderColors,
          ...(serverPrefs.folderColors ?? {}),
        },
      };

      set({ ...merged, loaded: true, loading: false });

      // Apply theme/density
      applyTheme(merged.theme);
      applyDensity(merged.density);

      // Cache locally
      try {
        localStorage.setItem("theme", merged.theme);
        localStorage.setItem("density", merged.density);
        localStorage.setItem("settingsCache", JSON.stringify(merged));
      } catch {
        // ignore
      }
    } catch {
      // Network error — try loading from cache
      try {
        const cached = localStorage.getItem("settingsCache");
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<Preferences>;
          const merged: Preferences = {
            ...DEFAULT_PREFERENCES,
            ...parsed,
            notifications: {
              ...DEFAULT_PREFERENCES.notifications,
              ...(parsed.notifications ?? {}),
            },
            panelSizes: {
              ...DEFAULT_PREFERENCES.panelSizes,
              ...(parsed.panelSizes ?? {}),
            },
            folderColors: {
              ...DEFAULT_PREFERENCES.folderColors,
              ...(parsed.folderColors ?? {}),
            },
          };
          set({ ...merged, loaded: true, loading: false });
          applyTheme(merged.theme);
          applyDensity(merged.density);
        } else {
          set({ loaded: true, loading: false });
        }
      } catch {
        set({ loaded: true, loading: false });
      }
    }
  },

  resetToDefaults: () => {
    set({ ...DEFAULT_PREFERENCES });
    applyTheme(DEFAULT_PREFERENCES.theme);
    applyDensity(DEFAULT_PREFERENCES.density);
    debouncedSaveToServer(DEFAULT_PREFERENCES);
  },
}));

/** Apply theme to <html> element */
export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    // system
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}

/** Apply density to <html> element */
export function applyDensity(density: DensityMode) {
  const root = document.documentElement;
  if (density === "compact") {
    root.classList.add("density-compact");
  } else {
    root.classList.remove("density-compact");
  }
}
