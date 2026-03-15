/** Global keyboard shortcut manager */

import { useEffect, useCallback } from "react";
import { useUIStore } from "@/stores/ui-store.ts";
import { isInputElement } from "@/lib/keyboard.ts";

interface ShortcutHandlers {
  onNavigateDown?: () => void;
  onNavigateUp?: () => void;
  onOpen?: () => void;
  onEscape?: () => void;
  onToggleSelect?: () => void;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onCompose?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onStar?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
  onMoveToFolder?: () => void;
  onUndo?: () => void;
  onSearch?: () => void;
  onHelp?: () => void;
  onGoToMailbox?: (role: string) => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const chordPrefix = useUIStore((s) => s.chordPrefix);
  const setChordPrefix = useUIStore((s) => s.setChordPrefix);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleReadingPane = useUIStore((s) => s.toggleReadingPane);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when typing in inputs
      if (isInputElement(e.target)) return;

      // Don't intercept browser shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Handle chord second key
      if (chordPrefix === "g") {
        setChordPrefix(null);
        switch (key) {
          case "i":
            handlers.onGoToMailbox?.("inbox");
            break;
          case "s":
            handlers.onGoToMailbox?.("sent");
            break;
          case "d":
            handlers.onGoToMailbox?.("drafts");
            break;
          case "t":
            handlers.onGoToMailbox?.("trash");
            break;
        }
        e.preventDefault();
        return;
      }

      // Start chord
      if (key === "g") {
        setChordPrefix("g");
        e.preventDefault();
        return;
      }

      // Single-key shortcuts
      switch (key) {
        case "j":
        case "arrowdown":
          handlers.onNavigateDown?.();
          e.preventDefault();
          break;
        case "k":
        case "arrowup":
          handlers.onNavigateUp?.();
          e.preventDefault();
          break;
        case "enter":
        case "o":
          handlers.onOpen?.();
          e.preventDefault();
          break;
        case "escape":
          handlers.onEscape?.();
          e.preventDefault();
          break;
        case "x":
          handlers.onToggleSelect?.();
          e.preventDefault();
          break;
        case "r":
          if (e.shiftKey) break;
          handlers.onReply?.();
          e.preventDefault();
          break;
        case "a":
          handlers.onReplyAll?.();
          e.preventDefault();
          break;
        case "f":
          handlers.onForward?.();
          e.preventDefault();
          break;
        case "c":
          handlers.onCompose?.();
          e.preventDefault();
          break;
        case "e":
          handlers.onArchive?.();
          e.preventDefault();
          break;
        case "#":
        case "delete":
          handlers.onDelete?.();
          e.preventDefault();
          break;
        case "s":
          handlers.onStar?.();
          e.preventDefault();
          break;
        case "z":
          handlers.onUndo?.();
          e.preventDefault();
          break;
        case "v":
          handlers.onMoveToFolder?.();
          e.preventDefault();
          break;
        case "/":
          handlers.onSearch?.();
          e.preventDefault();
          break;
        case "?":
          handlers.onHelp?.();
          e.preventDefault();
          break;
        case "[":
          toggleSidebar();
          e.preventDefault();
          break;
        case "]":
          toggleReadingPane();
          e.preventDefault();
          break;
      }

      // Shift combos
      if (e.shiftKey) {
        switch (key) {
          case "i":
            handlers.onMarkRead?.();
            e.preventDefault();
            break;
          case "u":
            handlers.onMarkUnread?.();
            e.preventDefault();
            break;
        }
      }
    },
    [handlers, chordPrefix, setChordPrefix, toggleSidebar, toggleReadingPane],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
