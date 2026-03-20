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
  Download,
  Upload,
  CalendarClock,
  Clock,
  Users,
} from "lucide-react";
import type { VirtualFolder } from "@/stores/ui-store.ts";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { queryEmailIds, updateEmails, destroyEmails } from "@/api/mail.ts";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTasks } from "@/hooks/use-tasks.ts";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { ShareMailboxDialog } from "@/components/mail/share-mailbox-dialog.tsx";

const FOLDER_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

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
  const virtualFolder = useUIStore((s) => s.virtualFolder);
  const setVirtualFolder = useUIStore((s) => s.setVirtualFolder);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { startExportMailbox, startImportMailbox } = useTasks();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importTargetMailboxId, setImportTargetMailboxId] = useState<string | null>(null);
  const [shareMailbox, setShareMailbox] = useState<Mailbox | null>(null);

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
    const toastId = toast.loading(t("toast.markingAllRead"));
    try {
      const ids = await queryEmailIds({
        filter: { inMailbox: mailboxId, notKeyword: "$seen" },
      });
      if (ids.length === 0) {
        toast.dismiss(toastId);
        toast(t("toast.allAlreadyRead"));
        return;
      }
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of ids) {
        updates[id] = { "keywords/$seen": true };
      }
      await updateEmails(updates);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success(t("toast.markedAsRead", { count: ids.length }), { id: toastId });
    } catch {
      toast.error(t("toast.failedMarkAllRead"), { id: toastId });
    }
  }, [queryClient, t]);

  const handleEmptyFolder = useCallback(async (mailboxId: string, folderName: string) => {
    const toastId = toast.loading(t("toast.emptying", { name: folderName }));
    try {
      const ids = await queryEmailIds({
        filter: { inMailbox: mailboxId },
      });
      if (ids.length === 0) {
        toast.dismiss(toastId);
        toast(t("toast.alreadyEmpty", { name: folderName }));
        return;
      }
      await destroyEmails(ids);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      toast.success(t("toast.emptied", { name: folderName, count: ids.length }), { id: toastId });
    } catch {
      toast.error(t("toast.failedToEmpty", { name: folderName }), { id: toastId });
    }
  }, [queryClient, t]);

  const handleRenameMailbox = useCallback((mailboxId: string, newName: string) => {
    if (newName.trim()) {
      updateMailbox({ id: mailboxId, updates: { name: newName.trim() } });
    }
  }, [updateMailbox]);

  const handleExportFolder = useCallback((mailboxId: string) => {
    startExportMailbox(mailboxId, "mbox");
  }, [startExportMailbox]);

  const handleImportToFolder = useCallback((mailboxId: string) => {
    setImportTargetMailboxId(mailboxId);
    importInputRef.current?.click();
  }, []);

  const handleImportFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && importTargetMailboxId) {
      startImportMailbox(importTargetMailboxId, file);
      setImportTargetMailboxId(null);
    }
    // Reset input so the same file can be selected again.
    e.target.value = "";
  }, [importTargetMailboxId, startImportMailbox]);

  const handleDropEmails = useCallback(async (emailIds: string[], fromMailboxId: string, toMailboxId: string, folderName: string) => {
    // Optimistically remove from current email list immediately.
    const emailIdSet = new Set(emailIds);
    queryClient.setQueriesData(
      { queryKey: ["emails"] },
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== "object") return oldData;
        const data = oldData as {
          pages: Array<{ emails: Array<{ id: string }>; total: number; position: number }>;
          pageParams: unknown[];
        };
        if (!data.pages) return oldData;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            emails: page.emails.filter((e) => !emailIdSet.has(e.id)),
            total: Math.max(0, page.total - emailIds.length),
          })),
        };
      },
    );

    toast(t("toast.movedMessages", { count: emailIds.length, name: folderName }));

    try {
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of emailIds) {
        updates[id] = {
          [`mailboxIds/${fromMailboxId}`]: null,
          [`mailboxIds/${toMailboxId}`]: true,
        };
      }
      await updateEmails(updates);
    } catch {
      toast.error(t("toast.failedToMove"));
    }

    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
  }, [queryClient, t]);

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
    <div className="py-2 flex flex-col gap-1" role="tree" aria-label={t("folder.mailFolders")}>
      {/* Hidden file input for mbox import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".mbox,.eml"
        className="hidden"
        onChange={handleImportFileSelected}
      />

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
          onDropEmails={handleDropEmails}
          onExportFolder={handleExportFolder}
          onImportToFolder={handleImportToFolder}
          onShare={setShareMailbox}
        />
      ))}

      {/* Virtual folders */}
      <VirtualFolderItem
        icon={<CalendarClock size={16} />}
        label={t("folder.scheduled")}
        isActive={virtualFolder === "scheduled"}
        onClick={() => setVirtualFolder("scheduled")}
      />
      <VirtualFolderItem
        icon={<Clock size={16} />}
        label={t("folder.snoozed")}
        isActive={virtualFolder === "snoozed"}
        onClick={() => setVirtualFolder("snoozed")}
      />

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
          onDropEmails={handleDropEmails}
          onExportFolder={handleExportFolder}
          onImportToFolder={handleImportToFolder}
          onShare={setShareMailbox}
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
              boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.08)",
            }}
            placeholder={t("folder.folderNamePlaceholder")}
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
          {t("folder.newFolder")}
        </button>
      )}

      {/* Share folder dialog */}
      {shareMailbox && (
        <ShareMailboxDialog
          open={!!shareMailbox}
          onOpenChange={(open) => { if (!open) setShareMailbox(null); }}
          mailbox={shareMailbox}
        />
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
  onDropEmails,
  onExportFolder,
  onImportToFolder,
  onShare,
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
  onDropEmails?: (emailIds: string[], fromMailboxId: string, toMailboxId: string, folderName: string) => void;
  onExportFolder?: (mailboxId: string) => void;
  onImportToFolder?: (mailboxId: string) => void;
  onShare?: (mailbox: Mailbox) => void;
}) {
  const { t } = useTranslation();
  const folderColor = useSettingsStore((s) => s.folderColors[mailbox.id]);
  const setFolderColor = useSettingsStore((s) => s.setFolderColor);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(mailbox.name);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

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

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = mailbox.myRights.mayAddItems ? "move" : "none";
    },
    [mailbox.myRights.mayAddItems],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDropTarget(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDropTarget(false);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDropTarget(false);
      if (!mailbox.myRights.mayAddItems) return;
      try {
        const data = JSON.parse(e.dataTransfer.getData("text/plain"));
        const emailIds = data.emailIds as string[];
        const fromMailboxId = data.fromMailboxId as string;
        if (emailIds && fromMailboxId && fromMailboxId !== mailbox.id) {
          onDropEmails?.(emailIds, fromMailboxId, mailbox.id, mailbox.name);
        }
      } catch {
        // Not valid drag data, ignore
      }
    },
    [mailbox.id, mailbox.name, mailbox.myRights.mayAddItems, onDropEmails],
  );

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
        {t("folder.markAllAsRead")}
      </ContextMenu.Item>
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger
          className="flex items-center px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
          style={{
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span className="flex-1">{t("folder.color")}</span>
          {folderColor && (
            <div
              className="w-3 h-3 rounded-full ml-2 shrink-0"
              style={{ backgroundColor: folderColor }}
            />
          )}
        </ContextMenu.SubTrigger>
        <ContextMenu.Portal>
          <ContextMenu.SubContent
            className="p-2 animate-scale-in"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-primary)",
              boxShadow: "var(--shadow-lg)",
              borderRadius: "var(--radius-md)",
              zIndex: 50,
            }}
          >
            <div className="grid grid-cols-4 gap-1.5">
              {FOLDER_COLORS.map((c) => (
                <ContextMenu.Item
                  key={c}
                  className="w-6 h-6 rounded-full cursor-pointer outline-none flex items-center justify-center transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                  onSelect={() => setFolderColor(mailbox.id, c)}
                >
                  {c === folderColor && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </ContextMenu.Item>
              ))}
            </div>
            {folderColor && (
              <>
                <div
                  className="my-1.5"
                  style={{ borderTop: "1px solid var(--color-border-primary)" }}
                />
                <ContextMenu.Item
                  className="flex items-center justify-center px-2.5 py-1 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150 text-xs"
                  style={{
                    color: "var(--color-text-secondary)",
                    borderRadius: "var(--radius-sm)",
                  }}
                  onSelect={() => setFolderColor(mailbox.id, null)}
                >
                  {t("folder.noColor")}
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
      {!isRoleFolder && (
        <>
          {onShare && mailbox.myRights.mayRename && (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
              style={{
                color: "var(--color-text-primary)",
                borderRadius: "var(--radius-sm)",
              }}
              onSelect={() => onShare(mailbox)}
            >
              <Users size={14} />
              {t("folder.shareFolder")}
            </ContextMenu.Item>
          )}
          {mailbox.myRights.mayRename && (
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
              {t("folder.rename")}
            </ContextMenu.Item>
          )}
          {mailbox.myRights.mayDelete && (
            <>
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
                {t("folder.deleteFolder")}
              </ContextMenu.Item>
            </>
          )}
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
          {t("folder.empty", { name: mailbox.name })}
        </ContextMenu.Item>
      )}
      <ContextMenu.Separator
        className="my-1"
        style={{ borderTop: "1px solid var(--color-border-primary)" }}
      />
      <ContextMenu.Item
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
        style={{
          color: "var(--color-text-primary)",
          borderRadius: "var(--radius-sm)",
        }}
        onSelect={() => onExportFolder?.(mailbox.id)}
      >
        <Download size={14} />
        {t("tasks.exportFolder")}
      </ContextMenu.Item>
      <ContextMenu.Item
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
        style={{
          color: "var(--color-text-primary)",
          borderRadius: "var(--radius-sm)",
        }}
        onSelect={() => onImportToFolder?.(mailbox.id)}
      >
        <Upload size={14} />
        {t("tasks.importToFolder")}
      </ContextMenu.Item>
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
            boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.08)",
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
            backgroundColor: isDropTarget
              ? "var(--color-message-selected)"
              : isActive
                ? "var(--color-message-selected)"
                : "transparent",
            color: isActive ? "var(--color-text-accent)" : "var(--color-text-primary)",
            borderRadius: "var(--radius-sm)",
            marginLeft: "4px",
            marginRight: "4px",
            width: "calc(100% - 8px)",
            border: isDropTarget ? "2px solid var(--color-bg-accent)" : "2px solid transparent",
            cursor: isDropTarget ? "move" : undefined,
          }}
          onMouseOver={(e) => {
            if (!isActive && !isDropTarget) e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
          }}
          onMouseOut={(e) => {
            if (!isActive && !isDropTarget) e.currentTarget.style.backgroundColor = "transparent";
          }}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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
          {folderColor && (
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                backgroundColor: folderColor,
              }}
            />
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
          {mailbox.shareWith && Object.keys(mailbox.shareWith).length > 0 && (
            <Users size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          )}
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

/** Virtual folder item (Scheduled / Snoozed) — simplified, no context menu or drag-drop */
const VirtualFolderItem = React.memo(function VirtualFolderItem({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-1 text-sm transition-all duration-150 group"
      role="treeitem"
      aria-selected={isActive}
      aria-current={isActive ? "true" : undefined}
      style={{
        paddingLeft: "12px",
        height: "var(--density-sidebar-item)",
        backgroundColor: isActive ? "var(--color-message-selected)" : "transparent",
        color: isActive ? "var(--color-text-accent)" : "var(--color-text-primary)",
        borderRadius: "var(--radius-sm)",
        marginLeft: "4px",
        marginRight: "4px",
        width: "calc(100% - 8px)",
        border: "2px solid transparent",
      }}
      onMouseOver={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)";
      }}
      onMouseOut={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span
        className="shrink-0"
        style={{
          color: isActive ? "var(--color-text-accent)" : "var(--color-text-secondary)",
        }}
      >
        {icon}
      </span>
      <span className="truncate flex-1 text-left font-normal">
        {label}
      </span>
    </button>
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
  onDropEmails,
  onExportFolder,
  onImportToFolder,
  onShare,
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
  onDropEmails?: (emailIds: string[], fromMailboxId: string, toMailboxId: string, folderName: string) => void;
  onExportFolder?: (mailboxId: string) => void;
  onImportToFolder?: (mailboxId: string) => void;
  onShare?: (mailbox: Mailbox) => void;
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
        onDropEmails={onDropEmails}
        onExportFolder={onExportFolder}
        onImportToFolder={onImportToFolder}
        onShare={onShare}
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
          onDropEmails={onDropEmails}
          onExportFolder={onExportFolder}
          onImportToFolder={onImportToFolder}
          onShare={onShare}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
