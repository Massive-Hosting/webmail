/** PGP Settings panel - one-click setup and advanced key management */

import React, { useState, useCallback, useRef } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Trash2,
  Upload,
  Key,
  Check,
  AlertTriangle,
} from "lucide-react";
import { usePGPStore, type SignDefault, type EncryptDefault } from "@/stores/pgp-store.ts";
import { formatFingerprint } from "@/lib/pgp.ts";
import { useQuery } from "@tanstack/react-query";
import { fetchIdentities } from "@/api/mail.ts";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { StyledSelect } from "@/components/ui/styled-select.tsx";

export const PGPSettingsPanel = React.memo(function PGPSettingsPanel() {
  const { t } = useTranslation();
  const isSetUp = usePGPStore((s) => s.isSetUp);
  const isUnlocked = usePGPStore((s) => s.isUnlocked);
  const keyInfo = usePGPStore((s) => s.keyInfo);
  const loading = usePGPStore((s) => s.loading);
  const error = usePGPStore((s) => s.error);
  const publicKeyArmored = usePGPStore((s) => s.publicKeyArmored);
  const signDefault = usePGPStore((s) => s.signDefault);
  const encryptDefault = usePGPStore((s) => s.encryptDefault);
  const autoLookupKeys = usePGPStore((s) => s.autoLookupKeys);
  const email = usePGPStore((s) => s.email);

  const setup = usePGPStore((s) => s.setup);
  const deleteKey = usePGPStore((s) => s.deleteKey);
  const setSignDefault = usePGPStore((s) => s.setSignDefault);
  const setEncryptDefault = usePGPStore((s) => s.setEncryptDefault);
  const setAutoLookupKeys = usePGPStore((s) => s.setAutoLookupKeys);
  const importPrivateKey = usePGPStore((s) => s.importPrivateKey);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const { data: identities } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    staleTime: 5 * 60 * 1000,
  });

  const defaultIdentity = identities?.[0];

  const handleOneClickSetup = useCallback(async () => {
    if (!defaultIdentity) {
      toast.error(t("pgp.noIdentity"));
      return;
    }

    // We need the password to derive the passphrase. Since login already happened,
    // we prompt for it. In production this could be passed from the session.
    const password = window.prompt(t("pgp.passwordPrompt"));
    if (!password) return;

    try {
      await setup(defaultIdentity.name, defaultIdentity.email, password);
      toast.success(t("pgp.enabledToast"));
    } catch {
      toast.error(t("pgp.failedToEnable"));
    }
  }, [defaultIdentity, setup, t]);

  if (!isSetUp || !isUnlocked) {
    return (
      <div className="p-6">
        <SetupView
          loading={loading}
          error={error}
          onSetup={handleOneClickSetup}
          onImport={() => setShowImportDialog(true)}
        />
        {showImportDialog && (
          <ImportKeyDialog
            email={email ?? defaultIdentity?.email ?? ""}
            onClose={() => setShowImportDialog(false)}
            onImport={importPrivateKey}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Status banner */}
      <div
        className="flex items-center gap-3 p-4 rounded-lg"
        style={{
          backgroundColor: "rgba(34, 197, 94, 0.08)",
          border: "1px solid rgba(34, 197, 94, 0.2)",
        }}
      >
        <ShieldCheck size={20} style={{ color: "#22c55e" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {t("pgp.signingEnabled")}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            {t("pgp.signingEnabledDesc")}
          </p>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-md text-sm"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--color-text-danger, #dc2626)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Preferences */}
      <div className="flex flex-col gap-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("pgp.defaults")}
        </h3>

        <div className="flex items-center justify-between">
          <label
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("pgp.signOutgoing")}
          </label>
          <SelectDropdown
            value={signDefault}
            onChange={(v) => setSignDefault(v as SignDefault)}
            options={[
              { value: "always", label: t("pgp.always") },
              { value: "ask", label: t("pgp.askEachTime") },
              { value: "never", label: t("pgp.never") },
            ]}
          />
        </div>

        <div className="flex items-center justify-between">
          <label
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("pgp.encryptWhenAvailable")}
          </label>
          <SelectDropdown
            value={encryptDefault}
            onChange={(v) => setEncryptDefault(v as EncryptDefault)}
            options={[
              { value: "always", label: t("pgp.always") },
              { value: "ask", label: t("pgp.askEachTime") },
              { value: "never", label: t("pgp.never") },
            ]}
          />
        </div>

        <div className="flex items-center justify-between">
          <label
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("pgp.autoLookup")}
          </label>
          <button
            onClick={() => setAutoLookupKeys(!autoLookupKeys)}
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{
              backgroundColor: autoLookupKeys
                ? "var(--color-bg-accent)"
                : "var(--color-bg-tertiary)",
            }}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
              style={{
                transform: autoLookupKeys
                  ? "translateX(18px)"
                  : "translateX(3px)",
              }}
            />
          </button>
        </div>
      </div>

      {/* Advanced section (collapsed by default) */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--color-text-accent)" }}
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {t("pgp.advancedSettings")}
      </button>

      {showAdvanced && keyInfo && (
        <AdvancedSettings
          keyInfo={keyInfo}
          publicKeyArmored={publicKeyArmored}
          email={email}
          onDelete={deleteKey}
          loading={loading}
        />
      )}
    </div>
  );
});

/** Initial setup view — no jargon */
function SetupView({
  loading,
  error,
  onSetup,
  onImport,
}: {
  loading: boolean;
  error: string | null;
  onSetup: () => void;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto py-8">
      <div
        className="flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
        style={{ backgroundColor: "var(--color-bg-tertiary)" }}
      >
        <Shield size={28} style={{ color: "var(--color-text-secondary)" }} />
      </div>

      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        {t("pgp.digitallySignTitle")}
      </h3>

      <p
        className="text-sm mb-6 leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {t("pgp.digitallySignDesc")}
      </p>

      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-md text-sm mb-4 w-full"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--color-text-danger, #dc2626)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <ShieldAlert size={14} />
          {error}
        </div>
      )}

      <button
        onClick={onSetup}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
        style={{ backgroundColor: "var(--color-bg-accent)" }}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ShieldCheck size={16} />
        )}
        {t("pgp.enableSigning")}
      </button>

      <button
        onClick={onImport}
        className="mt-3 text-xs"
        style={{ color: "var(--color-text-accent)" }}
      >
        {t("pgp.importExistingKey")}
      </button>
    </div>
  );
}

/** Advanced settings: key details, export, revoke */
function AdvancedSettings({
  keyInfo,
  publicKeyArmored,
  email,
  onDelete,
  loading,
}: {
  keyInfo: NonNullable<ReturnType<typeof usePGPStore.getState>["keyInfo"]>;
  publicKeyArmored: string | null;
  email: string | null;
  onDelete: (email: string) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const privateKeyArmored = usePGPStore((s) => s.privateKeyArmored);

  const handleCopyPublicKey = useCallback(async () => {
    if (!publicKeyArmored) return;
    await navigator.clipboard.writeText(publicKeyArmored);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("pgp.publicKeyCopied"));
  }, [publicKeyArmored, t]);

  const handleExportPublicKey = useCallback(() => {
    if (!publicKeyArmored) return;
    const blob = new Blob([publicKeyArmored], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${email ?? "public"}-pgp-public.asc`;
    a.click();
    URL.revokeObjectURL(url);
  }, [publicKeyArmored, email]);

  const handleExportPrivateKey = useCallback(() => {
    if (!privateKeyArmored) return;
    const proceed = window.confirm(t("pgp.exportWarning"));
    if (!proceed) return;

    const blob = new Blob([privateKeyArmored], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${email ?? "private"}-pgp-private.asc`;
    a.click();
    URL.revokeObjectURL(url);
  }, [privateKeyArmored, email, t]);

  const handleDelete = useCallback(async () => {
    if (!email) return;
    const proceed = window.confirm(t("pgp.deleteConfirm"));
    if (!proceed) return;
    await onDelete(email);
    toast.success(t("pgp.keyDeleted"));
  }, [email, onDelete, t]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Key card */}
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-secondary)",
        }}
      >
        <div className="flex items-start gap-3">
          <Key
            size={16}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--color-text-secondary)" }}
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {keyInfo.userIDs[0]?.email ?? email}
            </p>
            <p
              className="text-xs mt-1 font-mono"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {formatFingerprint(keyInfo.fingerprint)}
            </p>
            <div
              className="flex items-center gap-3 mt-2 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <span>{t("pgp.algorithm", { algorithm: keyInfo.algorithm })}</span>
              <span>{t("pgp.created", { date: formatDate(keyInfo.created) })}</span>
              {keyInfo.expires && (
                <span
                  style={{
                    color: keyInfo.isExpired
                      ? "var(--color-text-danger, #dc2626)"
                      : undefined,
                  }}
                >
                  {keyInfo.isExpired
                    ? t("pgp.expired", { date: formatDate(keyInfo.expires) })
                    : t("pgp.expires", { date: formatDate(keyInfo.expires) })}
                </span>
              )}
            </div>

            {keyInfo.isRevoked && (
              <div
                className="flex items-center gap-1 mt-2 text-xs"
                style={{ color: "var(--color-text-danger, #dc2626)" }}
              >
                <AlertTriangle size={12} />
                {t("pgp.keyRevoked")}
              </div>
            )}
          </div>
        </div>

        {/* Key actions */}
        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--color-border-secondary)" }}>
          <ActionBtn
            icon={copied ? <Check size={12} /> : <Copy size={12} />}
            label={copied ? t("pgp.copied") : t("pgp.copyPublicKey")}
            onClick={handleCopyPublicKey}
          />
          <ActionBtn
            icon={<Download size={12} />}
            label={t("pgp.exportPublic")}
            onClick={handleExportPublicKey}
          />
          <ActionBtn
            icon={<Download size={12} />}
            label={t("pgp.exportPrivate")}
            onClick={handleExportPrivateKey}
          />
          <ActionBtn
            icon={<Trash2 size={12} />}
            label={t("pgp.deleteKey")}
            onClick={handleDelete}
            danger
          />
        </div>
      </div>
    </div>
  );
}

/** Import key dialog */
function ImportKeyDialog({
  email,
  onClose,
  onImport,
}: {
  email: string;
  onClose: () => void;
  onImport: (armoredKey: string, email: string, passphrase: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [keyText, setKeyText] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setKeyText(reader.result as string);
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!keyText.trim()) {
      setError(t("pgp.pasteOrUpload"));
      return;
    }
    if (!passphrase.trim()) {
      setError(t("pgp.enterPassphrase"));
      return;
    }

    setImporting(true);
    setError(null);

    try {
      await onImport(keyText.trim(), email, passphrase);
      toast.success(t("pgp.importSuccess"));
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("pgp.failedToImport"),
      );
    } finally {
      setImporting(false);
    }
  }, [keyText, passphrase, email, onImport, onClose, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-md rounded-lg p-6 flex flex-col gap-4"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-primary)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("pgp.importTitle")}
        </h3>

        {error && (
          <div
            className="text-sm p-2 rounded"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "var(--color-text-danger, #dc2626)",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {t("pgp.privateKeyArmored")}
          </label>
          <textarea
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;...&#10;-----END PGP PRIVATE KEY BLOCK-----"
            className="w-full h-32 px-3 py-2 text-xs font-mono rounded-md outline-none resize-none"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs self-start"
            style={{ color: "var(--color-text-accent)" }}
          >
            <Upload size={12} />
            {t("pgp.uploadFile")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".asc,.gpg,.pgp"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {t("pgp.passphrase")}
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={t("pgp.passphrasePlaceholder")}
            className="w-full h-9 px-3 text-sm rounded-md outline-none"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
            }}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md"
            style={{
              color: "var(--color-text-secondary)",
              backgroundColor: "var(--color-bg-tertiary)",
            }}
          >
            {t("pgp.cancel")}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-md disabled:opacity-60"
            style={{ backgroundColor: "var(--color-bg-accent)" }}
          >
            {importing && <Loader2 size={14} className="animate-spin" />}
            {t("pgp.import")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small action button used in key card */
function ActionBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{
        color: danger
          ? "var(--color-text-danger, #dc2626)"
          : "var(--color-text-secondary)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/** Select dropdown styled consistently */
function SelectDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <StyledSelect
      value={value}
      onValueChange={onChange}
      options={options}
    />
  );
}
