/** Saved searches section for the sidebar */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Search, Pencil, Trash2 } from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { useSearchStore } from "@/stores/search-store.ts";
import { useTranslation } from "react-i18next";

export const SavedSearchesList = React.memo(function SavedSearchesList() {
  const { t } = useTranslation();
  const savedSearches = useSettingsStore((s) => s.savedSearches);
  const removeSavedSearch = useSettingsStore((s) => s.removeSavedSearch);
  const renameSavedSearch = useSettingsStore((s) => s.renameSavedSearch);
  const executeSearch = useSearchStore((s) => s.executeSearch);
  const activeQuery = useSearchStore((s) => s.query);
  const isSearchActive = useSearchStore((s) => s.isSearchActive);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleClick = useCallback(
    (query: string) => {
      executeSearch(query);
    },
    [executeSearch],
  );

  const handleRenameStart = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  }, []);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameSavedSearch(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, renameSavedSearch]);

  if (savedSearches.length === 0) return null;

  return (
    <div className="py-2 flex flex-col gap-0.5">
      <div
        className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider select-none"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {t("search.savedSearches")}
      </div>
      {savedSearches.map((saved) => {
        const isActive = isSearchActive && activeQuery === saved.query;

        if (renamingId === saved.id) {
          return (
            <div
              key={saved.id}
              className="flex items-center gap-2.5 w-full px-3 py-1"
              style={{
                height: "var(--density-sidebar-item)",
                marginLeft: "4px",
                marginRight: "4px",
                width: "calc(100% - 8px)",
              }}
            >
              <span
                className="shrink-0"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <Search size={16} />
              </span>
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={handleRenameSubmit}
                className="flex-1 h-6 px-1.5 text-sm outline-none"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-focus)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.08)",
                }}
              />
            </div>
          );
        }

        return (
          <ContextMenu.Root key={saved.id}>
            <ContextMenu.Trigger asChild>
              <button
                onClick={() => handleClick(saved.query)}
                className="flex items-center gap-2.5 w-full px-3 py-1 text-sm transition-all duration-150 group"
                style={{
                  height: "var(--density-sidebar-item)",
                  backgroundColor: isActive
                    ? "var(--color-message-selected)"
                    : "transparent",
                  color: isActive
                    ? "var(--color-text-accent)"
                    : "var(--color-text-primary)",
                  borderRadius: "var(--radius-sm)",
                  marginLeft: "4px",
                  marginRight: "4px",
                  width: "calc(100% - 8px)",
                }}
                onMouseOver={(e) => {
                  if (!isActive)
                    e.currentTarget.style.backgroundColor =
                      "var(--color-bg-tertiary)";
                }}
                onMouseOut={(e) => {
                  if (!isActive)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
                title={saved.query}
              >
                <span
                  className="shrink-0"
                  style={{
                    color: isActive
                      ? "var(--color-text-accent)"
                      : "var(--color-text-secondary)",
                  }}
                >
                  <Search size={16} />
                </span>
                <span className="truncate flex-1 text-left font-normal">
                  {saved.name}
                </span>
              </button>
            </ContextMenu.Trigger>

            <ContextMenu.Portal>
              <ContextMenu.Content
                className="min-w-[160px] p-1 text-sm animate-scale-in"
                style={{
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-primary)",
                  boxShadow: "var(--shadow-lg)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <ContextMenu.Item
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                  style={{
                    color: "var(--color-text-primary)",
                    borderRadius: "var(--radius-sm)",
                  }}
                  onSelect={() => handleRenameStart(saved.id, saved.name)}
                >
                  <Pencil size={14} />
                  {t("search.renameSearch")}
                </ContextMenu.Item>
                <ContextMenu.Separator
                  className="my-1"
                  style={{
                    borderTop: "1px solid var(--color-border-primary)",
                  }}
                />
                <ContextMenu.Item
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                  style={{
                    color: "var(--color-text-danger)",
                    borderRadius: "var(--radius-sm)",
                  }}
                  onSelect={() => removeSavedSearch(saved.id)}
                >
                  <Trash2 size={14} />
                  {t("search.deleteSearch")}
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
    </div>
  );
});
