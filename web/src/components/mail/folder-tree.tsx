/** Mailbox folder tree component */

import React, { useCallback, useState } from "react";
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
  MoreHorizontal,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  inbox: <Inbox size={16} />,
  drafts: <FileEdit size={16} />,
  sent: <Send size={16} />,
  archive: <Archive size={16} />,
  junk: <AlertTriangle size={16} />,
  trash: <Trash2 size={16} />,
};

export const FolderTree = React.memo(function FolderTree() {
  const { standardFolders, customFolders, isLoading, createMailbox, deleteMailbox } = useMailboxes();
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const setSelectedMailbox = useUIStore((s) => s.setSelectedMailbox);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

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

  if (isLoading) {
    return (
      <div className="p-2 flex flex-col gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton width={16} height={16} />
            <Skeleton width={80 + Math.random() * 40} height={14} />
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
    <div className="py-1" role="tree" aria-label="Mail folders">
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
        />
      ))}

      {/* Separator */}
      {customFolders.length > 0 && (
        <div
          className="mx-3 my-1"
          style={{ borderTop: "1px solid var(--color-border-secondary)" }}
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
          depth={0}
        />
      ))}

      {/* Create folder */}
      {creatingFolder ? (
        <div className="px-3 py-1">
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
            className="w-full h-7 px-2 text-sm rounded outline-none"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-focus)",
            }}
            placeholder="Folder name..."
          />
        </div>
      ) : (
        <button
          onClick={() => setCreatingFolder(true)}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{ color: "var(--color-text-tertiary)" }}
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
}) {
  const [showContext, setShowContext] = useState(false);

  return (
    <DropdownMenu.Root open={showContext} onOpenChange={setShowContext}>
      <DropdownMenu.Trigger asChild>
        <button
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowContext(true);
          }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors duration-150 group"
          role="treeitem"
          aria-selected={isActive}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-current={isActive ? "true" : undefined}
          style={{
            paddingLeft: `${12 + depth * 16}px`,
            height: "var(--density-sidebar-item)",
            backgroundColor: isActive ? "var(--color-message-selected)" : "transparent",
            color: isActive ? "var(--color-text-accent)" : "var(--color-text-primary)",
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
              className="shrink-0"
            >
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
          )}
          <span className="shrink-0" style={{ color: isActive ? "var(--color-text-accent)" : "var(--color-text-secondary)" }}>
            {icon}
          </span>
          <span className={`truncate flex-1 text-left ${mailbox.unreadEmails > 0 ? "font-semibold" : ""}`}>
            {mailbox.name}
          </span>
          {mailbox.unreadEmails > 0 && (
            <Badge count={mailbox.unreadEmails} />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[160px] rounded-md p-1 text-sm"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
          sideOffset={5}
        >
          <DropdownMenu.Item
            className="flex items-center px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-primary)" }}
            onSelect={() => {}}
          >
            Mark all as read
          </DropdownMenu.Item>
          {!isRoleFolder && (
            <>
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-primary)" }}
                onSelect={() => {}}
              >
                Rename
              </DropdownMenu.Item>
              <DropdownMenu.Separator
                className="my-1"
                style={{ borderTop: "1px solid var(--color-border-secondary)" }}
              />
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-danger)" }}
                onSelect={() => onDelete(mailbox.id)}
              >
                Delete folder
              </DropdownMenu.Item>
            </>
          )}
          {(mailbox.role === "trash" || mailbox.role === "junk") && (
            <DropdownMenu.Item
              className="flex items-center px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: "var(--color-text-danger)" }}
              onSelect={() => {}}
            >
              Empty {mailbox.name}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
  depth,
}: {
  mailbox: Mailbox;
  childrenMap: Map<string | null, Mailbox[]>;
  isActive: boolean;
  expandedFolders: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
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
          depth={depth + 1}
        />
      ))}
    </>
  );
}
