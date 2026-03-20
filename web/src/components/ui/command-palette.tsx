/** Command palette (Cmd+K) — search actions, folders, and settings */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Inbox, Send, FileEdit, Archive, Trash2, AlertTriangle,
  Pencil, Reply, Forward, Search, Settings, Moon, Sun,
  Calendar, Users as ContactsIcon, Star, Mail, Command,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/ui-store.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  group: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: string) => void;
}

export const CommandPalette = React.memo(function CommandPalette({
  open,
  onOpenChange,
  onAction,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { findByRole } = useMailboxes();
  const setSelectedMailbox = useUIStore((s) => s.setSelectedMailbox);
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Build commands
  const commands = useMemo((): CommandItem[] => {
    const items: CommandItem[] = [];

    // Navigation
    const navFolders: Array<{ role: string; icon: React.ReactNode; label: string; shortcut?: string }> = [
      { role: "inbox", icon: <Inbox size={15} />, label: t("settings.inbox"), shortcut: "G I" },
      { role: "drafts", icon: <FileEdit size={15} />, label: t("compose.reply").replace("Reply", "Drafts"), shortcut: "G D" },
      { role: "sent", icon: <Send size={15} />, label: "Sent", shortcut: "G S" },
      { role: "archive", icon: <Archive size={15} />, label: t("action.archive") },
      { role: "junk", icon: <AlertTriangle size={15} />, label: t("action.junk") },
      { role: "trash", icon: <Trash2 size={15} />, label: "Trash", shortcut: "G T" },
    ];

    for (const f of navFolders) {
      const mb = findByRole(f.role as "inbox");
      if (mb) {
        items.push({
          id: `go-${f.role}`,
          label: `Go to ${f.label}`,
          icon: f.icon,
          shortcut: f.shortcut,
          group: "Navigation",
          action: () => {
            setActiveView("mail");
            setSelectedMailbox(mb.id);
          },
        });
      }
    }

    items.push({
      id: "go-contacts",
      label: "Go to Contacts",
      icon: <ContactsIcon size={15} />,
      group: "Navigation",
      action: () => setActiveView("contacts"),
    });
    items.push({
      id: "go-calendar",
      label: "Go to Calendar",
      icon: <Calendar size={15} />,
      group: "Navigation",
      action: () => setActiveView("calendar"),
    });

    // Actions
    items.push({
      id: "compose",
      label: t("action.newMail"),
      icon: <Pencil size={15} />,
      shortcut: "C",
      group: "Actions",
      action: () => onAction("compose"),
    });
    items.push({
      id: "search",
      label: "Focus search",
      icon: <Search size={15} />,
      shortcut: "/",
      group: "Actions",
      action: () => onAction("search"),
    });
    items.push({
      id: "settings",
      label: t("nav.settings"),
      icon: <Settings size={15} />,
      group: "Actions",
      action: () => onAction("settings"),
    });
    items.push({
      id: "theme",
      label: "Toggle theme",
      icon: <Sun size={15} />,
      group: "Actions",
      action: () => onAction("theme"),
    });

    return items;
  }, [t, findByRole, setSelectedMailbox, setActiveView, onAction]);

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Group
  const grouped = useMemo(() => {
    const groups: Array<{ name: string; items: CommandItem[] }> = [];
    const groupMap = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      if (!groupMap.has(item.group)) {
        groupMap.set(item.group, []);
      }
      groupMap.get(item.group)!.push(item);
    }
    for (const [name, items] of groupMap) {
      groups.push({ name, items });
    }
    return groups;
  }, [filtered]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].action();
        onOpenChange(false);
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [filtered, activeIndex, onOpenChange],
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <>
      <div className="command-palette__overlay" onClick={() => onOpenChange(false)} />
      <div className="command-palette__content" onKeyDown={handleKeyDown}>
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: "1px solid var(--color-border-secondary)" }}>
          <Command size={15} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="command-palette__input"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            style={{ borderBottom: "none" }}
          />
        </div>
        <div className="command-palette__list" ref={listRef}>
          {grouped.map((group) => (
            <div key={group.name}>
              <div className="command-palette__group">{group.name}</div>
              {group.items.map((item) => {
                const idx = flatIndex++;
                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    className={`command-palette__item ${idx === activeIndex ? "command-palette__item--active" : ""}`}
                    onClick={() => {
                      item.action();
                      onOpenChange(false);
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className="command-palette__item-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="command-palette__item-shortcut">{item.shortcut}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div
              className="text-center py-6 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No matching commands
            </div>
          )}
        </div>
      </div>
    </>
  );
});
