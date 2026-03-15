/** Contact groups (address books) sidebar section */

import React, { useState, useCallback } from "react";
import { Users, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { AddressBook } from "@/types/contacts.ts";

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
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreateGroup(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  }, [newName, onCreateGroup]);

  const handleRename = useCallback(
    (id: string) => {
      if (editName.trim()) {
        onRenameGroup(id, editName.trim());
        setEditingId(null);
      }
    },
    [editName, onRenameGroup],
  );

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
          Groups
        </span>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          title="New group"
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
            placeholder="Group name..."
            autoFocus
            className="flex-1 text-xs px-2 py-1 rounded border outline-none bg-transparent"
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
        label="All Contacts"
        icon={<Users size={14} />}
        count={totalContacts}
        isActive={selectedGroupId === null}
        onClick={() => onSelectGroup(null)}
      />

      {/* Address books */}
      {addressBooks.map((book) =>
        editingId === book.id ? (
          <div key={book.id} className="flex items-center gap-1 px-3 py-1.5">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(book.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
              className="flex-1 text-xs px-2 py-1 rounded border outline-none bg-transparent"
              style={{
                color: "var(--color-text-primary)",
                borderColor: "var(--color-border-primary)",
              }}
            />
            <button
              onClick={() => handleRename(book.id)}
              className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-accent)" }}
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <GroupItem
            key={book.id}
            label={book.name}
            count={contactCounts[book.id] ?? 0}
            isActive={selectedGroupId === book.id}
            onClick={() => onSelectGroup(book.id)}
            onRename={() => {
              setEditingId(book.id);
              setEditName(book.name);
            }}
            onDelete={book.isDefault ? undefined : () => onDeleteGroup(book.id)}
          />
        ),
      )}
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
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
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
      {/* Edit/delete only visible on hover */}
      {(onRename || onDelete) && (
        <div className="hidden group-hover:flex items-center gap-0.5">
          {onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
              className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <Pencil size={10} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-error, #dc2626)" }}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
