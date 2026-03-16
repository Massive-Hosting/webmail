/** Reusable date/time picker dialog for scheduling and snooze */

import React, { useState, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DateTimePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onConfirm: (date: Date) => void;
}

export const DateTimePickerDialog = React.memo(function DateTimePickerDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
}: DateTimePickerDialogProps) {
  const { t } = useTranslation();
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [error, setError] = useState("");

  // Reset to sensible defaults when the dialog opens
  useEffect(() => {
    if (open) {
      const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
      setDateValue(formatDateForInput(defaultDate));
      setTimeValue(formatTimeForInput(defaultDate));
      setError("");
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    if (!dateValue || !timeValue) {
      setError("Please select both date and time.");
      return;
    }
    const date = new Date(`${dateValue}T${timeValue}`);
    if (isNaN(date.getTime())) {
      setError("Invalid date or time.");
      return;
    }
    if (date.getTime() < Date.now()) {
      setError("Please select a future date and time.");
      return;
    }
    setError("");
    onConfirm(date);
    onOpenChange(false);
  }, [dateValue, timeValue, onConfirm, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full rounded-lg flex flex-col animate-scale-in"
          style={{
            maxWidth: 360,
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-elevated)",
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--color-border-primary)" }}
          >
            <Dialog.Title
              className="text-sm font-semibold flex items-center gap-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              <CalendarClock size={16} style={{ color: "var(--color-text-accent)" }} />
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Date
                </label>
                <input
                  type="date"
                  value={dateValue}
                  min={formatDateForInput(new Date())}
                  onChange={(e) => { setDateValue(e.target.value); setError(""); }}
                  className="w-full px-3 py-2 text-sm rounded-md outline-none"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-secondary)",
                  }}
                />
              </div>
              <div className="flex-1">
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Time
                </label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={(e) => { setTimeValue(e.target.value); setError(""); }}
                  className="w-full px-3 py-2 text-sm rounded-md outline-none"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-secondary)",
                  }}
                />
              </div>
            </div>
            {error && (
              <div className="text-xs" style={{ color: "var(--color-text-danger, #ef4444)" }}>
                {error}
              </div>
            )}
          </div>

          <div
            className="flex justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--color-border-primary)" }}
          >
            <Dialog.Close asChild>
              <button
                className="px-4 py-1.5 text-sm rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {t("compose.cancel")}
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              className="px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
              style={{
                backgroundColor: "var(--color-bg-accent)",
                color: "#ffffff",
              }}
            >
              {t("compose.apply")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeForInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
