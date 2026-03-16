/** Sieve script editor for advanced filter editing */

import React, { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Save, Loader2, Code2 } from "lucide-react";
import { fetchSieveScript, updateSieveScript } from "@/api/mail.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const SieveEditor = React.memo(function SieveEditor() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState<string>("");
  const [isActive, setIsActive] = useState(false);
  const [content, setContent] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    fetchSieveScript()
      .then((script) => {
        if (cancelled) return;
        if (script) {
          setScriptId(script.id);
          setScriptName(script.name);
          setIsActive(script.isActive);
          setContent(script.content);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
        toast.error(t("sieve.loadError"));
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleSave = useCallback(async () => {
    if (!scriptId) return;
    setSaving(true);
    try {
      await updateSieveScript(scriptId, content);
      toast.success(t("sieve.saved"));
    } catch {
      toast.error(t("sieve.saveError"));
    } finally {
      setSaving(false);
    }
  }, [scriptId, content, t]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={14} className="animate-spin" />
          {t("sieve.loading")}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          {t("sieve.loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Code2 size={20} style={{ color: "var(--color-text-accent)" }} />
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("sieve.title")}
        </h2>
      </div>

      {/* Warning banner */}
      <div
        className="flex items-start gap-2 p-3 rounded-md mb-4 text-sm"
        style={{
          backgroundColor: "rgba(234, 179, 8, 0.1)",
          border: "1px solid rgba(234, 179, 8, 0.3)",
          color: "var(--color-text-primary)",
        }}
      >
        <AlertTriangle
          size={16}
          className="shrink-0 mt-0.5"
          style={{ color: "#eab308" }}
        />
        <span>{t("sieve.warning")}</span>
      </div>

      {/* Script info */}
      {scriptId ? (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("sieve.scriptName")}: {scriptName || "—"}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: isActive
                  ? "rgba(34, 197, 94, 0.15)"
                  : "var(--color-bg-tertiary)",
                color: isActive ? "#22c55e" : "var(--color-text-tertiary)",
              }}
            >
              {isActive ? t("sieve.active") : t("sieve.inactive")}
            </span>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-80 px-3 py-2 text-sm rounded-md outline-none resize-y"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: "13px",
              lineHeight: "1.5",
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
              tabSize: 4,
            }}
            spellCheck={false}
          />

          <div className="flex justify-end mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md transition-colors font-medium"
              style={{
                backgroundColor: "var(--color-bg-accent)",
                color: "var(--color-text-inverse)",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {t("sieve.save")}
            </button>
          </div>
        </>
      ) : (
        <div
          className="text-center py-8 rounded-lg"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px dashed var(--color-border-primary)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {t("sieve.noScript")}
          </p>
        </div>
      )}
    </div>
  );
});
