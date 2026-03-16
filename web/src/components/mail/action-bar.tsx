/** Outlook-style context-sensitive action bar above the message list */

import React, { useCallback, useMemo, useState } from "react";
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
  Clock,
  XCircle,
  BellOff,
} from "lucide-react";
import { addHours, setHours, setMinutes, setSeconds, addDays, nextMonday, isPast, format } from "date-fns";
import { startSnooze } from "@/api/tasks.ts";
import { updateEmails } from "@/api/mail.ts";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DateTimePickerDialog } from "@/components/ui/datetime-picker-dialog.tsx";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import type { EmailListItem } from "@/types/mail.ts";
import type { Mailbox } from "@/types/mail.ts";
import type { VirtualFolder } from "@/stores/ui-store.ts";

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
  /** Active virtual folder (scheduled/snoozed) */
  virtualFolder?: VirtualFolder;

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
  onSnooze?: (emailId: string, mailboxId: string, until: Date) => void;
}

export const ActionBar = React.memo(function ActionBar({
  selectedEmailIds,
  selectedEmails,
  hasReadingPaneMessage,
  currentMailboxId,
  currentMailboxRole,
  mailboxes,
  virtualFolder,
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
  onSnooze,
}: ActionBarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showSnoozePicker, setShowSnoozePicker] = useState(false);
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

  const handleSnooze = useCallback((until: Date) => {
    if (!singleEmail || !currentMailboxId) return;
    if (onSnooze) {
      onSnooze(singleEmail.id, currentMailboxId, until);
    } else {
      // Fallback: call API directly.
      startSnooze({
        emailId: singleEmail.id,
        mailboxId: currentMailboxId,
        until: until.toISOString(),
      }).then(() => {
        toast.success(t("action.snoozeSet", { time: format(until, "PPp") }));
      }).catch(() => {
        toast.error(t("tasks.failedToStart"));
      });
    }
  }, [singleEmail, currentMailboxId, onSnooze, t]);

  const getSnoozeTimeForLaterToday = useCallback((): Date => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 15) {
      return addHours(now, 3);
    }
    return setSeconds(setMinutes(setHours(now, 18), 0), 0);
  }, []);

  const handleCancelScheduled = useCallback(async () => {
    if (!hasSelection) return;
    try {
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of selectedIds) {
        updates[id] = { "keywords/$scheduled": null };
      }
      await updateEmails(updates);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success(t("action.sendCancelledSchedule"));
    } catch {
      toast.error("Failed to cancel scheduled send");
    }
  }, [hasSelection, selectedIds, queryClient, t]);

  const handleUnsnooze = useCallback(async () => {
    if (!hasSelection) return;
    try {
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of selectedIds) {
        updates[id] = { "keywords/$snoozed": null };
      }
      await updateEmails(updates);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success(t("action.unsnoozed"));
    } catch {
      toast.error("Failed to unsnooze");
    }
  }, [hasSelection, selectedIds, queryClient, t]);

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
              <Pencil size={18} />
              <span className="action-bar__btn-label">{t("action.newMail")}</span>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content className="tooltip-content" sideOffset={5}>
            {t("action.newMailShortcut")}
          </Tooltip.Content>
        </Tooltip.Root>

        <div className="action-bar__separator" />

        {/* Virtual folder actions: Cancel send / Unsnooze */}
        {virtualFolder === "scheduled" && (
          <ActionBarButton
            icon={<XCircle size={18} />}
            label={t("action.cancelSend")}
            tooltip={t("action.cancelSend")}
            onClick={handleCancelScheduled}
            disabled={!hasSelection}
          />
        )}
        {virtualFolder === "snoozed" && (
          <ActionBarButton
            icon={<BellOff size={18} />}
            label={t("action.unsnooze")}
            tooltip={t("action.unsnooze")}
            onClick={handleUnsnooze}
            disabled={!hasSelection}
          />
        )}

        {/* Core actions — always visible */}
        <ActionBarButton
          icon={<Trash2 size={18} />}
          label={t("action.delete")}
          tooltip={currentMailboxRole === "trash" ? t("action.deletePermanently") : t("action.delete")}
          onClick={handleDelete}
          disabled={!hasSelection}
        />
        <ActionBarButton
          icon={<Archive size={18} />}
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
                  <FolderInput size={18} />
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
          icon={<AlertTriangle size={18} />}
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
              icon={<Reply size={18} />}
              label={t("action.reply")}
              tooltip={t("action.replyShortcut")}
              onClick={handleReply}
            />
            <ActionBarButton
              icon={<ReplyAll size={18} />}
              label={t("action.replyAll")}
              tooltip={t("action.replyAllShortcut")}
              onClick={handleReplyAll}
            />
            <ActionBarButton
              icon={<Forward size={18} />}
              label={t("action.forward")}
              tooltip={t("action.forwardShortcut")}
              onClick={handleForward}
            />
          </>
        )}

        <div className="action-bar__separator" />

        {/* Read/Unread + Star */}
        <ActionBarButton
          icon={allRead ? <Mail size={18} /> : <MailOpen size={18} />}
          label={allRead ? t("action.unread") : t("action.read")}
          tooltip={allRead ? t("action.markAsUnread") : t("action.markAsRead")}
          onClick={handleToggleRead}
          disabled={!hasSelection}
        />
        <ActionBarButton
          icon={<Star size={18} className={isStarred ? "action-bar__icon--starred" : ""} />}
          label={isStarred ? t("action.unstar") : t("action.star")}
          tooltip={isStarred ? t("action.removeStar") : t("action.addStar")}
          onClick={handleToggleStar}
          disabled={!isSingleSelected}
        />

        {/* Snooze dropdown — hidden when viewing snoozed/scheduled virtual folders */}
        {!virtualFolder && <DropdownMenu.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <DropdownMenu.Trigger asChild>
                <button
                  className="action-bar__btn"
                  disabled={!isSingleSelected}
                >
                  <Clock size={18} />
                  <span className="action-bar__btn-label">{t("action.snooze")}</span>
                </button>
              </DropdownMenu.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Content className="tooltip-content" sideOffset={5}>
              {t("action.snooze")}
            </Tooltip.Content>
          </Tooltip.Root>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="action-bar__dropdown"
              sideOffset={4}
              align="start"
            >
              <DropdownMenu.Item
                className="action-bar__dropdown-item"
                onSelect={() => handleSnooze(getSnoozeTimeForLaterToday())}
              >
                {t("action.laterToday")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="action-bar__dropdown-item"
                onSelect={() => {
                  const tomorrow = addDays(new Date(), 1);
                  handleSnooze(setSeconds(setMinutes(setHours(tomorrow, 9), 0), 0));
                }}
              >
                {t("action.tomorrowMorning")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="action-bar__dropdown-item"
                onSelect={() => {
                  const monday = nextMonday(new Date());
                  handleSnooze(setSeconds(setMinutes(setHours(monday, 9), 0), 0));
                }}
              >
                {t("action.mondayMorning")}
              </DropdownMenu.Item>
              <DropdownMenu.Separator
                className="my-1"
                style={{ borderTop: "1px solid var(--color-border-primary)" }}
              />
              <DropdownMenu.Item
                className="action-bar__dropdown-item"
                onSelect={() => {
                  setTimeout(() => setShowSnoozePicker(true), 100);
                }}
              >
                <Clock size={13} style={{ marginRight: 4 }} />
                {t("action.pickDateTime")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>}

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
      <DateTimePickerDialog
        open={showSnoozePicker}
        onOpenChange={setShowSnoozePicker}
        title={t("action.snooze")}
        onConfirm={handleSnooze}
      />
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
