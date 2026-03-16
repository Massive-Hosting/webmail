/** Vacation / Out of Office auto-reply settings */

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Palmtree, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getVacationResponse,
  setVacationResponse,
  type VacationResponse,
} from "@/api/mail.ts";

export const VacationSettings = React.memo(function VacationSettings() {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEnabled, setIsEnabled] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [subject, setSubject] = useState("");
  const [textBody, setTextBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVacationResponse()
      .then((vr) => {
        if (cancelled) return;
        setIsEnabled(vr.isEnabled);
        setFromDate(vr.fromDate ? toLocalDatetime(vr.fromDate) : "");
        setToDate(vr.toDate ? toLocalDatetime(vr.toDate) : "");
        setSubject(vr.subject ?? "");
        setTextBody(vr.textBody ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const params: Partial<VacationResponse> = {
        isEnabled,
        fromDate: fromDate ? toUTCDate(fromDate) : null,
        toDate: toDate ? toUTCDate(toDate) : null,
        subject: subject || null,
        textBody,
        htmlBody: null,
      };
      await setVacationResponse(params);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [isEnabled, fromDate, toDate, subject, textBody]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2" style={{ color: "var(--color-text-tertiary)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  const isCurrentlyActive = isEnabled && isWithinDateRange(fromDate, toDate);

  return (
    <div className="p-6 space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <Palmtree
            size={18}
            className="mt-0.5"
            style={{ color: "var(--color-text-secondary)" }}
          />
          <div>
            <h3
              className="text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {t("vacation.enable")}
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {t("vacation.title")}
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={isEnabled}
          onChange={() => setIsEnabled(!isEnabled)}
        />
      </div>

      {/* Active status banner */}
      {isEnabled && isCurrentlyActive && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
          style={{
            backgroundColor: "var(--color-bg-success, rgba(34, 197, 94, 0.1))",
            color: "var(--color-text-success, #16a34a)",
          }}
        >
          <Check size={14} />
          {toDate
            ? t("vacation.activeUntil", { date: formatDisplayDate(toDate) })
            : t("vacation.active")}
        </div>
      )}

      {/* Date range */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("vacation.dateRange")}
        </label>
        <p
          className="text-xs mb-3"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {t("vacation.dateRangeHint")}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("vacation.startDate")}
            </label>
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md text-sm"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-secondary)",
              }}
            />
          </div>
          <div className="flex-1">
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("vacation.endDate")}
            </label>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md text-sm"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-secondary)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Subject */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("vacation.subject")}
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("vacation.subjectPlaceholder")}
          className="w-full px-3 py-1.5 rounded-md text-sm"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-secondary)",
          }}
        />
      </div>

      {/* Message body */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("vacation.message")}
        </label>
        <textarea
          value={textBody}
          onChange={(e) => setTextBody(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-md text-sm resize-y"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-secondary)",
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm" style={{ color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors"
          style={{
            backgroundColor: saving
              ? "var(--color-bg-tertiary)"
              : "var(--color-bg-accent)",
            color: saving
              ? "var(--color-text-tertiary)"
              : "var(--color-text-inverse)",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {t("vacation.save")}
        </button>
        {saved && (
          <span
            className="flex items-center gap-1 text-sm"
            style={{ color: "var(--color-text-success, #16a34a)" }}
          >
            <Check size={14} />
            {t("vacation.saved")}
          </span>
        )}
      </div>
    </div>
  );
});

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
      role="switch"
      aria-checked={checked}
      style={{
        backgroundColor: checked
          ? "var(--color-bg-accent)"
          : "var(--color-bg-tertiary)",
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? "translateX(22px)" : "translateX(4px)",
        }}
      />
    </button>
  );
}

/** Convert ISO UTC date string to local datetime-local value */
function toLocalDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** Convert local datetime-local value to ISO UTC string */
function toUTCDate(local: string): string {
  try {
    const d = new Date(local);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  } catch {
    return "";
  }
}

/** Check if current time is within fromDate..toDate range */
function isWithinDateRange(fromDate: string, toDate: string): boolean {
  const now = Date.now();
  if (fromDate) {
    const from = new Date(fromDate).getTime();
    if (!isNaN(from) && now < from) return false;
  }
  if (toDate) {
    const to = new Date(toDate).getTime();
    if (!isNaN(to) && now > to) return false;
  }
  return true;
}

/** Format a datetime-local value for display */
function formatDisplayDate(local: string): string {
  try {
    const d = new Date(local);
    if (isNaN(d.getTime())) return local;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return local;
  }
}
