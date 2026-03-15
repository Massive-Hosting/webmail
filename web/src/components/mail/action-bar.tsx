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
              <span className="action-bar__btn-label">New mail</span>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content className="tooltip-content" sideOffset={5}>
            New mail (C)
          </Tooltip.Content>
        </Tooltip.Root>

        <div className="action-bar__separator" />

        {/* Core actions — always visible */}
        <ActionBarButton
          icon={<Trash2 size={16} />}
          label="Delete"
          tooltip={currentMailboxRole === "trash" ? "Delete permanently" : "Delete"}
          onClick={handleDelete}
          disabled={!hasSelection}
        />
        <ActionBarButton
          icon={<Archive size={16} />}
          label="Archive"
          tooltip="Archive"
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
                  <span className="action-bar__btn-label">Move to</span>
                </button>
              </DropdownMenu.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Content className="tooltip-content" sideOffset={5}>
              Move to folder
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
                  No folders available
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <ActionBarButton
          icon={<AlertTriangle size={16} />}
          label="Junk"
          tooltip="Mark as junk"
          onClick={handleJunk}
          disabled={!hasSelection}
        />

        {/* Reply actions — only when a single message is open in the reading pane */}
        {showReplyActions && (
          <>
            <div className="action-bar__separator" />
            <ActionBarButton
              icon={<Reply size={16} />}
              label="Reply"
              tooltip="Reply (R)"
              onClick={handleReply}
            />
            <ActionBarButton
              icon={<ReplyAll size={16} />}
              label="Reply all"
              tooltip="Reply All (A)"
              onClick={handleReplyAll}
            />
            <ActionBarButton
              icon={<Forward size={16} />}
              label="Forward"
              tooltip="Forward (F)"
              onClick={handleForward}
            />
          </>
        )}

        <div className="action-bar__separator" />

        {/* Read/Unread + Star */}
        <ActionBarButton
          icon={allRead ? <Mail size={16} /> : <MailOpen size={16} />}
          label={allRead ? "Unread" : "Read"}
          tooltip={allRead ? "Mark as unread" : "Mark as read"}
          onClick={handleToggleRead}
          disabled={!hasSelection}
        />
        <ActionBarButton
          icon={<Star size={16} className={isStarred ? "action-bar__icon--starred" : ""} />}
          label={isStarred ? "Unstar" : "Star"}
          tooltip={isStarred ? "Remove star" : "Add star"}
          onClick={handleToggleStar}
          disabled={!isSingleSelected}
        />

        {/* Selection count for multi-select */}
        {selectionCount > 1 && (
          <>
            <div className="action-bar__separator" />
            <span className="action-bar__selection-count">
              {selectionCount} selected
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
