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

export const MailSettings = React.memo(function MailSettings() {
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
        title="Conversation view"
        description="Group related messages into threads."
      >
        <ToggleButtons
          options={[
            { value: true, label: "On" },
            { value: false, label: "Off" },
          ]}
          value={conversationView}
          onChange={setConversationView}
        />
      </SettingRow>

      {/* Reading pane */}
      <SettingRow
        title="Reading pane position"
        description="Where to display the message preview."
      >
        <ToggleButtons<ReadingPanePosition>
          options={[
            { value: "right", label: "Right" },
            { value: "bottom", label: "Bottom" },
            { value: "off", label: "Off" },
          ]}
          value={readingPane}
          onChange={setReadingPane}
        />
      </SettingRow>

      {/* Auto-advance */}
      <SettingRow
        title="After archive or delete"
        description="What to show after acting on a message."
      >
        <ToggleButtons<AutoAdvance>
          options={[
            { value: "next", label: "Next" },
            { value: "previous", label: "Previous" },
            { value: "list", label: "Return to list" },
          ]}
          value={autoAdvance}
          onChange={setAutoAdvance}
        />
      </SettingRow>

      {/* Mark as read */}
      <SettingRow
        title="Mark as read"
        description="When to mark messages as read."
      >
        <ToggleButtons<MarkReadDelay>
          options={[
            { value: 0, label: "Immediately" },
            { value: 2000, label: "After 2s" },
            { value: -1, label: "Manually" },
          ]}
          value={markReadDelay}
          onChange={setMarkReadDelay}
        />
      </SettingRow>

      {/* Undo send */}
      <SettingRow
        title="Undo send delay"
        description="Grace period to cancel a sent message."
      >
        <ToggleButtons<UndoSendDelay>
          options={[
            { value: 0, label: "Off" },
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
        title="Default reply mode"
        description="Which reply action to use by default."
      >
        <ToggleButtons<DefaultReplyMode>
          options={[
            { value: "reply", label: "Reply" },
            { value: "reply-all", label: "Reply All" },
          ]}
          value={defaultReplyMode}
          onChange={setDefaultReplyMode}
        />
      </SettingRow>

      {/* External images */}
      <SettingRow
        title="External images"
        description="Loading images from remote servers may reveal your IP address."
      >
        <ToggleButtons<ExternalImages>
          options={[
            { value: "never", label: "Never" },
            { value: "ask", label: "Ask" },
            { value: "always", label: "Always" },
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
