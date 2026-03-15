/** Mail settings: conversation view, reading pane, auto-advance, etc. */

import React from "react";
import { useSettingsStore } from "@/stores/settings-store.ts";
import type {
  ReadingPanePosition,
  AutoAdvance,
  MarkReadDelay,
  UndoSendDelay,
  DefaultReplyMode,
  ExternalImages,
} from "@/stores/settings-store.ts";
import { useTranslation } from "react-i18next";

export const MailSettings = React.memo(function MailSettings() {
  const { t } = useTranslation();
  const conversationView = useSettingsStore((s) => s.conversationView);
  const readingPane = useSettingsStore((s) => s.readingPane);
  const autoAdvance = useSettingsStore((s) => s.autoAdvance);
  const markReadDelay = useSettingsStore((s) => s.markReadDelay);
  const undoSendDelay = useSettingsStore((s) => s.undoSendDelay);
  const defaultReplyMode = useSettingsStore((s) => s.defaultReplyMode);
  const externalImages = useSettingsStore((s) => s.externalImages);

  const setConversationView = useSettingsStore((s) => s.setConversationView);
  const setReadingPane = useSettingsStore((s) => s.setReadingPane);
  const setAutoAdvance = useSettingsStore((s) => s.setAutoAdvance);
  const setMarkReadDelay = useSettingsStore((s) => s.setMarkReadDelay);
  const setUndoSendDelay = useSettingsStore((s) => s.setUndoSendDelay);
  const setDefaultReplyMode = useSettingsStore((s) => s.setDefaultReplyMode);
  const setExternalImages = useSettingsStore((s) => s.setExternalImages);

  return (
    <div className="p-6 space-y-6">
      {/* Conversation view */}
      <SettingRow
        title={t("mailSettings.conversationView")}
        description={t("mailSettings.conversationViewDesc")}
      >
        <ToggleButtons
          options={[
            { value: true, label: t("mailSettings.on") },
            { value: false, label: t("mailSettings.off") },
          ]}
          value={conversationView}
          onChange={setConversationView}
        />
      </SettingRow>

      {/* Reading pane */}
      <SettingRow
        title={t("mailSettings.readingPanePosition")}
        description={t("mailSettings.readingPanePositionDesc")}
      >
        <ToggleButtons<ReadingPanePosition>
          options={[
            { value: "right", label: t("mailSettings.right") },
            { value: "bottom", label: t("mailSettings.bottom") },
            { value: "off", label: t("mailSettings.off") },
          ]}
          value={readingPane}
          onChange={setReadingPane}
        />
      </SettingRow>

      {/* Auto-advance */}
      <SettingRow
        title={t("mailSettings.afterArchiveOrDelete")}
        description={t("mailSettings.afterArchiveOrDeleteDesc")}
      >
        <ToggleButtons<AutoAdvance>
          options={[
            { value: "next", label: t("mailSettings.next") },
            { value: "previous", label: t("mailSettings.previous") },
            { value: "list", label: t("mailSettings.returnToList") },
          ]}
          value={autoAdvance}
          onChange={setAutoAdvance}
        />
      </SettingRow>

      {/* Mark as read */}
      <SettingRow
        title={t("mailSettings.markAsRead")}
        description={t("mailSettings.markAsReadDesc")}
      >
        <ToggleButtons<MarkReadDelay>
          options={[
            { value: 0, label: t("mailSettings.immediately") },
            { value: 2000, label: t("mailSettings.after2s") },
            { value: -1, label: t("mailSettings.manually") },
          ]}
          value={markReadDelay}
          onChange={setMarkReadDelay}
        />
      </SettingRow>

      {/* Undo send */}
      <SettingRow
        title={t("mailSettings.undoSendDelay")}
        description={t("mailSettings.undoSendDelayDesc")}
      >
        <ToggleButtons<UndoSendDelay>
          options={[
            { value: 0, label: t("mailSettings.off") },
            { value: 5, label: "5s" },
            { value: 10, label: "10s" },
            { value: 30, label: "30s" },
          ]}
          value={undoSendDelay}
          onChange={setUndoSendDelay}
        />
      </SettingRow>

      {/* Default reply mode */}
      <SettingRow
        title={t("mailSettings.defaultReplyMode")}
        description={t("mailSettings.defaultReplyModeDesc")}
      >
        <ToggleButtons<DefaultReplyMode>
          options={[
            { value: "reply", label: t("mailSettings.reply") },
            { value: "reply-all", label: t("mailSettings.replyAll") },
          ]}
          value={defaultReplyMode}
          onChange={setDefaultReplyMode}
        />
      </SettingRow>

      {/* External images */}
      <SettingRow
        title={t("mailSettings.externalImages")}
        description={t("mailSettings.externalImagesDesc")}
      >
        <ToggleButtons<ExternalImages>
          options={[
            { value: "never", label: t("mailSettings.never") },
            { value: "ask", label: t("mailSettings.ask") },
            { value: "always", label: t("mailSettings.always") },
          ]}
          value={externalImages}
          onChange={setExternalImages}
        />
      </SettingRow>
    </div>
  );
});

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ToggleButtons<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md overflow-hidden"
      style={{ border: "1px solid var(--color-border-primary)" }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          className="px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor:
              value === option.value
                ? "var(--color-bg-accent)"
                : "var(--color-bg-primary)",
            color:
              value === option.value
                ? "var(--color-text-inverse)"
                : "var(--color-text-secondary)",
            borderRight:
              option !== options[options.length - 1]
                ? "1px solid var(--color-border-primary)"
                : undefined,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
