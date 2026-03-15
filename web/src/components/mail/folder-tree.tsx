/** Mailbox folder tree component — premium design */

import React, { useCallback, useState, useRef, useEffect } from "react";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useUIStore } from "@/stores/ui-store.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { Mailbox, MailboxRole } from "@/types/mail.ts";
import {
  Inbox,
  FileEdit,
  Send,
  Archive,
  AlertTriangle,
  Trash2,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { queryEmailIds, updateEmails, destroyEmails } from "@/api/mail.ts";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  inbox: <Inbox size={16} />,
  drafts: <FileEdit size={16} />,
  sent: <Send size={16} />,
  archive: <Archive size={16} />,
  junk: <AlertTriangle size={16} />,
  trash: <Trash2 size={16} />,
};

export const FolderTree = React.memo(function FolderTree() {
  const { standardFolders, customFolders, isLoading, createMailbox, deleteMailbox, updateMailbox } = useMailboxes();
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const setSelectedMailbox = useUIStore((s) => s.setSelectedMailbox);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const queryClient = useQueryClient();

  const toggleExpanded = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCreateFolder = useCallback(() => {
    if (newFolderName.trim()) {
      createMailbox({ name: newFolderName.trim() });
      setNewFolderName("");
      setCreatingFolder(false);
    }
  }, [newFolderName, createMailbox]);

  const handleMarkAllRead = useCallback(async (mailboxId: string) => {
    try {
      const ids = await queryEmailIds({
        filter: { inMailbox: mailboxId, notKeyword: "$seen" },
      });
      if (ids.length === 0) {
        toast("All messages are already read");
        return;
      }
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of ids) {
        updates[id] = { "keywords/$seen": true };
      }
      await updateEmails(updates);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast(`Marked ${ids.length} message${ids.length !== 1 ? "s" : ""} as read`);
    } catch {
      toast.error("Failed to mark all as read");
    }
  }, [queryClient]);

  const handleEmptyFolder = useCallback(async (mailboxId: string, folderName: string) => {
    try {
      const ids = await queryEmailIds({
        filter: { inMailbox: mailboxId },
      });
      if (ids.length === 0) {
        toast(`${folderName} is already empty`);
        return;
      }
      await destroyEmails(ids);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast(`Emptied ${folderName} (${ids.length} message${ids.length !== 1 ? "s" : ""})`);
    } catch {
      toast.error(`Failed to empty ${folderName}`);
    }
  }, [queryClient]);

  const handleRenameMailbox = useCallback((mailboxId: string, newName: string) => {
    if (newName.trim()) {
      updateMailbox({ id: mailboxId, updates: { name: newName.trim() } });
    }
  }, [updateMailbox]);

  if (isLoading) {
    return (
      <div className="p-2 flex flex-col gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2">
            <Skeleton width={16} height={16} />
            <Skeleton width={80 + Math.random() * 40} height={12} />
          </div>
        ))}
      </div>
    );
  }

  // Build child folders map
  const childrenMap = new Map<string | null, Mailbox[]>();
  for (const folder of customFolders) {
    const parentId = folder.parentId;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(folder);
  }

  return (
    <div className="py-1.5" role="tree" aria-label="Mail folders">
      {/* Standard folders */}
      {standardFolders.map((mailbox) => (
        <FolderItem
          key={mailbox.id}
          mailbox={mailbox}
          isActive={mailbox.id === selectedMailboxId}
          onClick={() => setSelectedMailbox(mailbox.id)}
          icon={ROLE_ICONS[mailbox.role ?? ""] ?? <Folder size={16} />}
          isRoleFolder
          onDelete={() => {}}
          onMarkAllRead={handleMarkAllRead}
          onEmptyFolder={handleEmptyFolder}
          onRename={handleRenameMailbox}
        />
      ))}

      {/* Separator */}
      {customFolders.length > 0 && (
        <div
          className="mx-3 my-1.5"
          style={{ borderTop: "1px solid var(--color-border-primary)" }}
        />
      )}

      {/* Custom folders */}
      {(childrenMap.get(null) ?? []).map((mailbox) => (
        <FolderItemWithChildren
          key={mailbox.id}
          mailbox={mailbox}
          childrenMap={childrenMap}
          isActive={mailbox.id === selectedMailboxId}
          expandedFolders={expandedFolders}
          onSelect={setSelectedMailbox}
          onToggleExpand={toggleExpanded}
          onDelete={deleteMailbox}
          onMarkAllRead={handleMarkAllRead}
          onEmptyFolder={handleEmptyFolder}
          onRename={handleRenameMailbox}
          depth={0}
        />
      ))}

      {/* Create folder */}
      {creatingFolder ? (
        <div className="px-3 py-1.5">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") setCreatingFolder(false);
            }}
            onBlur={() => {
              if (!newFolderName.trim()) setCreatingFolder(false);
            }}
            autoFocus
            className="w-full h-7 px-2 text-sm outline-none"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-focus)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.08)",
            }}
            placeholder="Folder name..."
          />
        </div>
      ) : (
        <button
          onClick={() => setCreatingFolder(true)}
          className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm transition-all duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-tertiary)" }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = "var(--color-text-tertiary)";
          }}
        >
          <FolderPlus size={16} />
          New folder
        </button>
      )}
    </div>
  );
});

/** Single folder item */
const FolderItem = React.memo(function FolderItem({
  mailbox,
  isActive,
  onClick,
  icon,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  isRoleFolder = false,
  onDelete,
  onMarkAllRead,
  onEmptyFolder,
  onRename,
}: {
  mailbox: Mailbox;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isRoleFolder?: boolean;
  onDelete: (id: string) => void;
  onMarkAllRead: (mailboxId: string) => void;
  onEmptyFolder: (mailboxId: string, folderName: string) => void;
  onRename: (mailboxId: string, newName: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(mailbox.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== mailbox.name) {
      onRename(mailbox.id, renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, mailbox.id, mailbox.name, onRename]);

  const contextMenuContent = (
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
        className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
        style={{
          color: "var(--color-text-primary)",
          borderRadius: "var(--radius-sm)",
        }}
        onSelect={() => onMarkAllRead(mailbox.id)}
      >
        Mark all as read
      </ContextMenu.Item>
      {!isRoleFolder && (
        <>
          <ContextMenu.Item
            className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            style={{
              color: "var(--color-text-primary)",
              borderRadius: "var(--radius-sm)",
            }}
            onSelect={() => {
              setRenameValue(mailbox.name);
              setIsRenaming(true);
            }}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator
            className="my-1"
            style={{ borderTop: "1px solid var(--color-border-primary)" }}
          />
          <ContextMenu.Item
            className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            style={{
              color: "var(--color-text-danger)",
              borderRadius: "var(--radius-sm)",
            }}
            onSelect={() => onDelete(mailbox.id)}
          >
            Delete folder
          </ContextMenu.Item>
        </>
      )}
      {(mailbox.role === "trash" || mailbox.role === "junk") && (
        <ContextMenu.Item
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{
            color: "var(--color-text-danger)",
            borderRadius: "var(--radius-sm)",
          }}
          onSelect={() => onEmptyFolder(mailbox.id, mailbox.name)}
        >
          Empty {mailbox.name}
        </ContextMenu.Item>
      )}
    </ContextMenu.Content>
  );

  if (isRenaming) {
    return (
      <div
        className="flex items-center gap-2.5 w-full px-3 py-1"
        style={{
          paddingLeft: `${12 + depth * 16}px`,
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
          {icon}
        </span>
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
          className="flex-1 h-6 px-1.5 text-sm outline-none"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-focus)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.08)",
          }}
        />
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          onClick={onClick}
          className="flex items-center gap-2.5 w-full px-3 py-1 text-sm transition-all duration-150 group"
          role="treeitem"
          aria-selected={isActive}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-current={isActive ? "true" : undefined}
          style={{
            paddingLeft: `${12 + depth * 16}px`,
            height: "var(--density-sidebar-item)",
            backgroundColor: isActive ? "var(--color-message-selected)" : "transparent",
            color: isActive ? "var(--color-text-accent)" : "var(--color-text-primary)",
            borderRadius: "var(--radius-sm)",
            marginLeft: "4px",
            marginRight: "4px",
            width: "calc(100% - 8px)",
          }}
          onMouseOver={(e) => {
            if (!isActive) e.currentTarget.style.backgroundColor = "var(--color-message-hover)";
          }}
          onMouseOut={(e) => {
            if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {hasChildren && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
              className="shrink-0 transition-transform duration-150"
              style={{
                transform: isExpanded ? "rotate(0deg)" : "rotate(0deg)",
              }}
            >
              {isExpanded ? (
                <ChevronDown size={13} style={{ color: "var(--color-text-tertiary)" }} />
              ) : (
                <ChevronRight size={13} style={{ color: "var(--color-text-tertiary)" }} />
              )}
            </span>
          )}
          <span
            className="shrink-0"
            style={{
              color: isActive ? "var(--color-text-accent)" : "var(--color-text-secondary)",
            }}
          >
            {icon}
          </span>
          <span className={`truncate flex-1 text-left ${mailbox.unreadEmails > 0 ? "font-semibold" : "font-normal"}`}>
            {mailbox.name}
          </span>
          {mailbox.unreadEmails > 0 && (
            <Badge count={mailbox.unreadEmails} />
          )}
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        {contextMenuContent}
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

/** Recursive folder item with children */
function FolderItemWithChildren({
  mailbox,
  childrenMap,
  isActive,
  expandedFolders,
  onSelect,
  onToggleExpand,
  onDelete,
  onMarkAllRead,
  onEmptyFolder,
  onRename,
  depth,
}: {
  mailbox: Mailbox;
  childrenMap: Map<string | null, Mailbox[]>;
  isActive: boolean;
  expandedFolders: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onMarkAllRead: (mailboxId: string) => void;
  onEmptyFolder: (mailboxId: string, folderName: string) => void;
  onRename: (mailboxId: string, newName: string) => void;
  depth: number;
}) {
  const children = childrenMap.get(mailbox.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedFolders.has(mailbox.id);

  return (
    <>
      <FolderItem
        mailbox={mailbox}
        isActive={isActive}
        onClick={() => onSelect(mailbox.id)}
        icon={<Folder size={16} />}
        depth={depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onToggleExpand={() => onToggleExpand(mailbox.id)}
        onDelete={onDelete}
        onMarkAllRead={onMarkAllRead}
        onEmptyFolder={onEmptyFolder}
        onRename={onRename}
      />
      {hasChildren && isExpanded && children.map((child) => (
        <FolderItemWithChildren
          key={child.id}
          mailbox={child}
          childrenMap={childrenMap}
          isActive={child.id === useUIStore.getState().selectedMailboxId}
          expandedFolders={expandedFolders}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onDelete={onDelete}
          onMarkAllRead={onMarkAllRead}
          onEmptyFolder={onEmptyFolder}
          onRename={onRename}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
