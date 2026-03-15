/** Keyboard shortcuts settings tab */

import React from "react";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { SHORTCUT_HELP } from "@/lib/keyboard.ts";
import { Kbd } from "@/components/ui/kbd.tsx";

export const KeyboardSettings = React.memo(function KeyboardSettings() {
  const enabled = useSettingsStore((s) => s.keyboardShortcuts);
  const setEnabled = useSettingsStore((s) => s.setKeyboardShortcuts);

  return (
    <div className="p-6 space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Keyboard shortcuts
          </h3>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Use single-key shortcuts for faster navigation and actions.
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          role="switch"
          aria-checked={enabled}
          style={{
            backgroundColor: enabled
              ? "var(--color-bg-accent)"
              : "var(--color-bg-tertiary)",
          }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
            style={{
              transform: enabled ? "translateX(22px)" : "translateX(4px)",
            }}
          />
        </button>
      </div>

      {/* Reference card */}
      <div
        className="pt-4"
        style={{
          borderTop: "1px solid var(--color-border-secondary)",
          opacity: enabled ? 1 : 0.5,
        }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          Shortcut reference
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SHORTCUT_HELP.map((category) => (
            <div key={category.name}>
              <h4
                className="text-xs font-semibold mb-2"
                style={{ color: "var(--color-text-accent)" }}
              >
                {category.name}
              </h4>
              <div className="flex flex-col gap-1.5">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span
                      className="text-sm"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {shortcut.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.split(" ").map((part, i) =>
                        part === "then" || part === "/" ? (
                          <span
                            key={i}
                            className="text-xs"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            {part}
                          </span>
                        ) : (
                          <Kbd key={i}>{part}</Kbd>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
