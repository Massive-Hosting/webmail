/** UI state store: panel layout, selections, active view */

import { create } from "zustand";
import { useComposeStore } from "@/stores/compose-store.ts";

interface PanelLayout {
  sidebarWidth: number;
  messageListWidth: number;
  sidebarCollapsed: boolean;
  readingPaneVisible: boolean;
}

export type AppView = "mail" | "contacts" | "calendar";

interface UIState extends PanelLayout {
  /** Active app view (mail, contacts, calendar) */
  activeView: AppView;
  /** Currently selected mailbox ID */
  selectedMailboxId: string | null;
  /** Currently selected email ID */
  selectedEmailId: string | null;
  /** Currently selected thread ID */
  selectedThreadId: string | null;
  /** Multi-selected email IDs */
  selectedEmailIds: Set<string>;
  /** Thread IDs that are expanded inline in the message list */
  expandedThreads: Set<string>;
  /** Whether we're on mobile */
  isMobile: boolean;
  /** Active view for mobile navigation */
  mobileView: "sidebar" | "list" | "message";
  /** Keyboard shortcut chord state */
  chordPrefix: string | null;
  /** Chord timeout ID */
  chordTimeout: ReturnType<typeof setTimeout> | null;

  // Actions
  setActiveView: (view: AppView) => void;
  setSidebarWidth: (width: number) => void;
  setMessageListWidth: (width: number) => void;
  toggleSidebar: () => void;
  toggleReadingPane: () => void;
  setSelectedMailbox: (id: string | null) => void;
  setSelectedEmail: (id: string | null, threadId?: string | null) => void;
  toggleEmailSelection: (id: string) => void;
  selectEmailRange: (ids: string[]) => void;
  selectAllEmails: (ids: string[]) => void;
  clearSelection: () => void;
  toggleThread: (threadId: string) => void;
  collapseThread: (threadId: string) => void;
  setIsMobile: (isMobile: boolean) => void;
  setMobileView: (view: "sidebar" | "list" | "message") => void;
  setChordPrefix: (prefix: string | null) => void;
  resetLayout: () => void;
}

const DEFAULT_LAYOUT: PanelLayout = {
  sidebarWidth: 240,
  messageListWidth: 380,
  sidebarCollapsed: false,
  readingPaneVisible: true,
};

function loadPersistedLayout(): Partial<PanelLayout> {
  try {
    const stored = localStorage.getItem("panelLayout");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {};
}

function persistLayout(layout: PanelLayout) {
  try {
    localStorage.setItem("panelLayout", JSON.stringify(layout));
  } catch {
    // ignore
  }
}

// Debounced save to server — writes panel layout as part of user preferences
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveToServer(layout: PanelLayout) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fetch("/api/settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        panelSizes: {
          sidebar: layout.sidebarWidth,
          messageList: layout.messageListWidth,
        },
      }),
    }).catch(() => {
      // silently fail
    });
  }, 1000);
}

export const useUIStore = create<UIState>((set, get) => {
  const persisted = loadPersistedLayout();
  const initialLayout = { ...DEFAULT_LAYOUT, ...persisted };

  return {
    ...initialLayout,
    activeView: "mail",
    selectedMailboxId: null,
    selectedEmailId: null,
    selectedThreadId: null,
    selectedEmailIds: new Set(),
    expandedThreads: new Set(),
    isMobile: false,
    mobileView: "list",
    chordPrefix: null,
    chordTimeout: null,

    setActiveView: (view) => set({ activeView: view }),

    setSidebarWidth: (width) => {
      const clamped = Math.max(200, Math.min(360, width));
      set({ sidebarWidth: clamped });
      const state = get();
      const layout: PanelLayout = {
        sidebarWidth: clamped,
        messageListWidth: state.messageListWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        readingPaneVisible: state.readingPaneVisible,
      };
      persistLayout(layout);
      debouncedSaveToServer(layout);
    },

    setMessageListWidth: (width) => {
      const clamped = Math.max(300, Math.min(600, width));
      set({ messageListWidth: clamped });
      const state = get();
      const layout: PanelLayout = {
        sidebarWidth: state.sidebarWidth,
        messageListWidth: clamped,
        sidebarCollapsed: state.sidebarCollapsed,
        readingPaneVisible: state.readingPaneVisible,
      };
      persistLayout(layout);
      debouncedSaveToServer(layout);
    },

    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      set({ sidebarCollapsed: next });
      const state = get();
      const layout: PanelLayout = {
        sidebarWidth: state.sidebarWidth,
        messageListWidth: state.messageListWidth,
        sidebarCollapsed: next,
        readingPaneVisible: state.readingPaneVisible,
      };
      persistLayout(layout);
      debouncedSaveToServer(layout);
    },

    toggleReadingPane: () => {
      const next = !get().readingPaneVisible;
      set({ readingPaneVisible: next });
      const state = get();
      const layout: PanelLayout = {
        sidebarWidth: state.sidebarWidth,
        messageListWidth: state.messageListWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        readingPaneVisible: next,
      };
      persistLayout(layout);
      debouncedSaveToServer(layout);
    },

    setSelectedMailbox: (id) => {
      // Minimize any inline compose drafts so they don't block navigation
      useComposeStore.getState().minimizeAllInlineDrafts();
      set({
        selectedMailboxId: id,
        selectedEmailId: null,
        selectedThreadId: null,
        selectedEmailIds: new Set(),
        expandedThreads: new Set(),
      });
    },

    setSelectedEmail: (id, threadId) => {
      // Minimize any inline compose drafts so the selected email is visible.
      useComposeStore.getState().minimizeAllInlineDrafts();
      set({
        selectedEmailId: id,
        selectedThreadId: threadId ?? null,
        selectedEmailIds: id ? new Set([id]) : new Set(),
      });
      if (get().isMobile && id) {
        set({ mobileView: "message" });
      }
    },

    toggleEmailSelection: (id) => {
      set((state) => {
        const next = new Set(state.selectedEmailIds);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return { selectedEmailIds: next };
      });
    },

    selectEmailRange: (ids) => {
      set((state) => {
        const next = new Set(state.selectedEmailIds);
        for (const id of ids) {
          next.add(id);
        }
        return { selectedEmailIds: next };
      });
    },

    selectAllEmails: (ids) => {
      set({ selectedEmailIds: new Set(ids) });
    },

    clearSelection: () => {
      set({ selectedEmailIds: new Set(), selectedEmailId: null, selectedThreadId: null });
    },

    toggleThread: (threadId) => {
      set((state) => {
        const next = new Set(state.expandedThreads);
        if (next.has(threadId)) {
          next.delete(threadId);
        } else {
          next.add(threadId);
        }
        return { expandedThreads: next };
      });
    },

    collapseThread: (threadId) => {
      set((state) => {
        const next = new Set(state.expandedThreads);
        next.delete(threadId);
        return { expandedThreads: next };
      });
    },

    setIsMobile: (isMobile) => set({ isMobile }),

    setMobileView: (view) => set({ mobileView: view }),

    setChordPrefix: (prefix) => {
      const state = get();
      if (state.chordTimeout) {
        clearTimeout(state.chordTimeout);
      }
      if (prefix) {
        const timeout = setTimeout(() => {
          set({ chordPrefix: null, chordTimeout: null });
        }, 1000);
        set({ chordPrefix: prefix, chordTimeout: timeout });
      } else {
        set({ chordPrefix: null, chordTimeout: null });
      }
    },

    resetLayout: () => {
      set(DEFAULT_LAYOUT);
      persistLayout(DEFAULT_LAYOUT);
      debouncedSaveToServer(DEFAULT_LAYOUT);
    },
  };
});
