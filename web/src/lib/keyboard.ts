/** Keyboard shortcut registry and types */

export interface Shortcut {
  key: string;
  label: string;
  category: string;
  chord?: string; // For two-key combos like "g i"
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  action: () => void;
}

export interface ShortcutCategory {
  name: string;
  shortcuts: { keys: string; label: string }[];
}

/** Check if the event target is an input element */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

/** Format a shortcut for display */
export function formatShortcutKey(shortcut: {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  chord?: string;
}): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.meta) parts.push("Cmd");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.chord) {
    parts.push(shortcut.chord.toUpperCase());
    parts.push("then");
  }
  parts.push(shortcut.key.toUpperCase());
  return parts.join("+").replace("+then+", " then ");
}

/** All keyboard shortcut definitions for the help dialog */
export const SHORTCUT_HELP: ShortcutCategory[] = [
  {
    name: "Navigation",
    shortcuts: [
      { keys: "G then I", label: "Go to Inbox" },
      { keys: "G then S", label: "Go to Sent" },
      { keys: "G then D", label: "Go to Drafts" },
      { keys: "G then T", label: "Go to Trash" },
      { keys: "/", label: "Focus search bar" },
      { keys: "?", label: "Show keyboard shortcuts" },
    ],
  },
  {
    name: "Messages",
    shortcuts: [
      { keys: "J / Down", label: "Next message" },
      { keys: "K / Up", label: "Previous message" },
      { keys: "Enter / O", label: "Open message" },
      { keys: "Esc", label: "Back to list / deselect" },
      { keys: "X", label: "Toggle select" },
    ],
  },
  {
    name: "Actions",
    shortcuts: [
      { keys: "R", label: "Reply" },
      { keys: "A", label: "Reply all" },
      { keys: "F", label: "Forward" },
      { keys: "C", label: "Compose new" },
      { keys: "E", label: "Archive" },
      { keys: "#", label: "Delete" },
      { keys: "S", label: "Star/unstar" },
      { keys: "Shift+I", label: "Mark read" },
      { keys: "Shift+U", label: "Mark unread" },
      { keys: "V", label: "Move to folder" },
      { keys: "Z", label: "Undo last action" },
    ],
  },
  {
    name: "Layout",
    shortcuts: [
      { keys: "[", label: "Toggle sidebar" },
      { keys: "]", label: "Toggle reading pane" },
    ],
  },
];
