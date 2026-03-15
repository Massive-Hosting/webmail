/** Keyboard shortcut help dialog */

import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SHORTCUT_HELP } from "@/lib/keyboard.ts";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useTranslation } from "react-i18next";

interface KeyboardShortcutDialogProps {
  onClose: () => void;
}

export const KeyboardShortcutDialog = React.memo(function KeyboardShortcutDialog({
  onClose,
}: KeyboardShortcutDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "var(--color-bg-overlay)" }}
        />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg p-6"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            boxShadow: "var(--shadow-elevated)",
            border: "1px solid var(--color-border-primary)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {t("shortcuts.title")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SHORTCUT_HELP.map((category) => (
              <div key={category.name}>
                <h3
                  className="text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-accent)" }}
                >
                  {category.name}
                </h3>
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

          <div
            className="mt-4 pt-3 text-xs text-center"
            style={{
              color: "var(--color-text-tertiary)",
              borderTop: "1px solid var(--color-border-secondary)",
            }}
          >
            Press <Kbd>?</Kbd> to toggle this dialog
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
