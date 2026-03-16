/** Contact groups (address books) sidebar section */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Users, Plus, Check, X } from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { AddressBook } from "@/types/contacts.ts";
import { useTranslation } from "react-i18next";

interface ContactGroupsProps {
  addressBooks: AddressBook[];
  selectedGroupId: string | null;
  contactCounts: Record<string, number>;
  totalContacts: number;
  onSelectGroup: (groupId: string | null) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
}

export const ContactGroups = React.memo(function ContactGroups({
  addressBooks,
  selectedGroupId,
  contactCounts,
  totalContacts,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: ContactGroupsProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreateGroup(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  }, [newName, onCreateGroup]);

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {t("contacts.groups")}
        </span>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          title={t("contacts.newGroup")}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Create new group input */}
      {isCreating && (
        <div className="flex items-center gap-1 px-3 py-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setIsCreating(false);
            }}
            placeholder={t("contacts.groupName")}
            autoFocus
            className="flex-1 text-xs px-2 py-1 rounded border outline-none bg-transparent min-w-0"
            style={{
              color: "var(--color-text-primary)",
              borderColor: "var(--color-border-primary)",
            }}
          />
          <button
            onClick={handleCreate}
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-accent)" }}
          >
            <Check size={12} />
          </button>
          <button
            onClick={() => setIsCreating(false)}
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* All Contacts */}
      <GroupItem
        label={t("contacts.allContacts")}
        icon={<Users size={14} />}
        count={totalContacts}
        isActive={selectedGroupId === null}
        onClick={() => onSelectGroup(null)}
      />

      {/* Address books */}
      {addressBooks.map((book) => (
        <GroupItem
          key={book.id}
          label={book.name}
          count={contactCounts[book.id] ?? 0}
          isActive={selectedGroupId === book.id}
          onClick={() => onSelectGroup(book.id)}
          onRename={(name) => onRenameGroup(book.id, name)}
          onDelete={book.isDefault ? undefined : () => onDeleteGroup(book.id)}
        />
      ))}
    </div>
  );
});

function GroupItem({
  label,
  icon,
  count,
  isActive,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  icon?: React.ReactNode;
  count: number;
  isActive: boolean;
  onClick: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(label);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== label) {
      onRename?.(renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, label, onRename]);

  if (isRenaming) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 overflow-hidden">
        {icon && (
          <span className="shrink-0" style={{ color: "var(--color-text-tertiary)" }}>{icon}</span>
        )}
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") setIsRenaming(false);
          }}
          onBlur={handleRenameSubmit}
          className="flex-1 min-w-0 h-5 px-1 text-xs outline-none"
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

  const hasContextMenu = onRename || onDelete;

  const content = (
    <div
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer group transition-colors duration-100"
      style={{
        backgroundColor: isActive ? "var(--color-bg-tertiary)" : "transparent",
      }}
      onClick={onClick}
    >
      {icon && (
        <span style={{ color: "var(--color-text-tertiary)" }}>{icon}</span>
      )}
      <span
        className="flex-1 text-xs font-medium truncate"
        style={{
          color: isActive
            ? "var(--color-text-accent)"
            : "var(--color-text-secondary)",
        }}
      >
        {label}
      </span>
      <span
        className="text-xs tabular-nums"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {count}
      </span>
    </div>
  );

  if (!hasContextMenu) {
    return content;
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {content}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[140px] p-1 text-sm animate-scale-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-md)",
            zIndex: 50,
          }}
        >
          {onRename && (
            <ContextMenu.Item
              className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
              style={{
                color: "var(--color-text-primary)",
                borderRadius: "var(--radius-sm)",
              }}
              onSelect={() => {
                setRenameValue(label);
                setIsRenaming(true);
              }}
            >
              {t("contacts.renameGroup")}
            </ContextMenu.Item>
          )}
          {onDelete && (
            <>
              {onRename && (
                <ContextMenu.Separator
                  className="my-1"
                  style={{ borderTop: "1px solid var(--color-border-primary)" }}
                />
              )}
              <ContextMenu.Item
                className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{
                  color: "var(--color-text-danger)",
                  borderRadius: "var(--radius-sm)",
                }}
                onSelect={onDelete}
              >
                {t("contacts.deleteGroup")}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
