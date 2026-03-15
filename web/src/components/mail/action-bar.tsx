/** Outlook-style context-sensitive action bar above the message list */

import React, { useCallback, useMemo } from "react";
import {
  Pencil,
  Trash2,
  Archive,
  FolderInput,
  AlertTriangle,
  Reply,
  ReplyAll,
  Forward,
  Mail,
  MailOpen,
  Star,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import type { EmailListItem } from "@/types/mail.ts";
import type { Mailbox } from "@/types/mail.ts";

export interface ActionBarProps {
  /** Currently selected email IDs */
  selectedEmailIds: Set<string>;
  /** Selected emails data (for determining read/unread and star state) */
  selectedEmails: EmailListItem[];
  /** Whether a single message is open in the reading pane */
  hasReadingPaneMessage: boolean;
  /** Current mailbox ID */
  currentMailboxId: string | null;
  /** Current mailbox role */
  currentMailboxRole: string | null;
  /** All mailboxes (for "Move to" dropdown) */
  mailboxes: Mailbox[];

  // Callbacks
  onNewMail: () => void;
  onDelete: (emailIds: string[]) => void;
  onArchive: (emailIds: string[]) => void;
  onMoveToFolder: (emailIds: string[], targetMailboxId: string) => void;
  onJunk: (emailIds: string[]) => void;
  onReply: (emailItem: EmailListItem) => void;
  onReplyAll: (emailItem: EmailListItem) => void;
  onForward: (emailItem: EmailListItem) => void;
  onMarkRead: (emailIds: string[], seen: boolean) => void;
  onStar: (emailId: string, flagged: boolean) => void;
}

export const ActionBar = React.memo(function ActionBar({
  selectedEmailIds,
  selectedEmails,
  hasReadingPaneMessage,
  currentMailboxId,
  currentMailboxRole,
  mailboxes,
  onNewMail,
  onDelete,
  onArchive,
  onMoveToFolder,
  onJunk,
  onReply,
  onReplyAll,
  onForward,
  onMarkRead,
  onStar,
}: ActionBarProps) {
  const { t } = useTranslation();
  const selectionCount = selectedEmailIds.size;
  const hasSelection = selectionCount > 0;
  const isSingleSelected = selectionCount === 1;
  const showReplyActions = hasReadingPaneMessage && isSingleSelected;

  const selectedIds = useMemo(() => Array.from(selectedEmailIds), [selectedEmailIds]);

  // Determine read/unread state of selection
  const allRead = useMemo(
    () => selectedEmails.length > 0 && selectedEmails.every((e) => e.keywords["$seen"]),
    [selectedEmails],
  );

  // Determine star state of selection (for single)
  const isStarred = useMemo(
    () => selectedEmails.length === 1 && !!selectedEmails[0].keywords["$flagged"],
    [selectedEmails],
  );

  const singleEmail = isSingleSelected ? selectedEmails[0] : null;

  // Folders for "Move to" dropdown, excluding current mailbox
  const moveTargets = useMemo(
    () => mailboxes.filter((m) => m.id !== currentMailboxId),
    [mailboxes, currentMailboxId],
  );

  const handleDelete = useCallback(() => {
    if (hasSelection) onDelete(selectedIds);
  }, [hasSelection, selectedIds, onDelete]);

  const handleArchive = useCallback(() => {
    if (hasSelection) onArchive(selectedIds);
  }, [hasSelection, selectedIds, onArchive]);

  const handleJunk = useCallback(() => {
    if (hasSelection) onJunk(selectedIds);
  }, [hasSelection, selectedIds, onJunk]);

  const handleToggleRead = useCallback(() => {
    if (hasSelection) onMarkRead(selectedIds, !allRead);
  }, [hasSelection, selectedIds, allRead, onMarkRead]);

  const handleToggleStar = useCallback(() => {
    if (singleEmail) onStar(singleEmail.id, !isStarred);
  }, [singleEmail, isStarred, onStar]);

  const handleReply = useCallback(() => {
    if (singleEmail) onReply(singleEmail);
  }, [singleEmail, onReply]);

  const handleReplyAll = useCallback(() => {
    if (singleEmail) onReplyAll(singleEmail);
  }, [singleEmail, onReplyAll]);

  const handleForward = useCallback(() => {
    if (singleEmail) onForward(singleEmail);
  }, [singleEmail, onForward]);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="action-bar">
        {/* New mail — always visible */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button className="action-bar__btn action-bar__btn--primary" onClick={onNewMail}>
              <Pencil size={16} />
              <span className="action-bar__btn-label">{t("action.newMail")}</span>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content className="tooltip-content" sideOffset={5}>
            {t("action.newMailShortcut")}
          </Tooltip.Content>
        </Tooltip.Root>

        <div className="action-bar__separator" />

        {/* Core actions — always visible */}
        <ActionBarButton
          icon={<Trash2 size={16} />}
          label={t("action.delete")}
          tooltip={currentMailboxRole === "trash" ? t("action.deletePermanently") : t("action.delete")}
          onClick={handleDelete}
          disabled={!hasSelection}
        />
        <ActionBarButton
          icon={<Archive size={16} />}
          label={t("action.archive")}
          tooltip={t("action.archive")}
          onClick={handleArchive}
          disabled={!hasSelection}
        />

        {/* Move to dropdown */}
        <DropdownMenu.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <DropdownMenu.Trigger asChild>
                <button
                  className="action-bar__btn"
                  disabled={!hasSelection}
                >
                  <FolderInput size={16} />
                  <span className="action-bar__btn-label">{t("action.moveTo")}</span>
                </button>
              </DropdownMenu.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Content className="tooltip-content" sideOffset={5}>
              {t("action.moveToFolder")}
            </Tooltip.Content>
          </Tooltip.Root>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="action-bar__dropdown"
              sideOffset={4}
              align="start"
            >
              {moveTargets.map((m) => (
                <DropdownMenu.Item
                  key={m.id}
                  className="action-bar__dropdown-item"
                  onSelect={() => onMoveToFolder(selectedIds, m.id)}
                >
                  {m.name}
                </DropdownMenu.Item>
              ))}
              {moveTargets.length === 0 && (
                <DropdownMenu.Item className="action-bar__dropdown-item" disabled>
                  {t("action.noFoldersAvailable")}
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <ActionBarButton
          icon={<AlertTriangle size={16} />}
          label={t("action.junk")}
          tooltip={t("action.markAsJunk")}
          onClick={handleJunk}
          disabled={!hasSelection}
        />

        {/* Reply actions — only when a single message is open in the reading pane */}
        {showReplyActions && (
          <>
            <div className="action-bar__separator" />
            <ActionBarButton
              icon={<Reply size={16} />}
              label={t("action.reply")}
              tooltip={t("action.replyShortcut")}
              onClick={handleReply}
            />
            <ActionBarButton
              icon={<ReplyAll size={16} />}
              label={t("action.replyAll")}
              tooltip={t("action.replyAllShortcut")}
              onClick={handleReplyAll}
            />
            <ActionBarButton
              icon={<Forward size={16} />}
              label={t("action.forward")}
              tooltip={t("action.forwardShortcut")}
              onClick={handleForward}
            />
          </>
        )}

        <div className="action-bar__separator" />

        {/* Read/Unread + Star */}
        <ActionBarButton
          icon={allRead ? <Mail size={16} /> : <MailOpen size={16} />}
          label={allRead ? t("action.unread") : t("action.read")}
          tooltip={allRead ? t("action.markAsUnread") : t("action.markAsRead")}
          onClick={handleToggleRead}
          disabled={!hasSelection}
        />
        <ActionBarButton
          icon={<Star size={16} className={isStarred ? "action-bar__icon--starred" : ""} />}
          label={isStarred ? t("action.unstar") : t("action.star")}
          tooltip={isStarred ? t("action.removeStar") : t("action.addStar")}
          onClick={handleToggleStar}
          disabled={!isSingleSelected}
        />

        {/* Selection count for multi-select */}
        {selectionCount > 1 && (
          <>
            <div className="action-bar__separator" />
            <span className="action-bar__selection-count">
              {t("action.selected", { count: selectionCount })}
            </span>
          </>
        )}
      </div>
    </Tooltip.Provider>
  );
});

function ActionBarButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className="action-bar__btn"
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
          <span className="action-bar__btn-label">{label}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content className="tooltip-content" sideOffset={5}>
        {tooltip}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}
