/** Security settings: TOTP 2FA and App Passwords (alongside PGP) */

import React, { useState, useCallback, useEffect } from "react";
import { Shield, Smartphone, Key, Plus, Trash2, Copy, Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getTOTPStatus,
  setupTOTP,
  confirmTOTP,
  disableTOTP,
  listAppPasswords,
  createAppPassword,
  deleteAppPassword,
  type AppPassword,
  type TOTPSetupResponse,
} from "@/api/security.ts";
import { PGPSettingsPanel } from "./pgp-settings.tsx";

export const SecuritySettings = React.memo(function SecuritySettings() {
  return (
    <div className="p-6 space-y-8">
      <TOTPSection />
      <div className="border-t-secondary" />
      <AppPasswordsSection />
      <div className="border-t-secondary" />
      <PGPSettingsPanel />
    </div>
  );
});

// --- TOTP Section ---

function TOTPSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<TOTPSetupResponse | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getTOTPStatus();
      setEnabled(status.enabled);
    } catch {
      // Ignore — status will default to false
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSetup = useCallback(async () => {
    try {
      const result = await setupTOTP();
      setSetup(result);
      setConfirmCode("");
    } catch {
      toast.error(t("security.setupFailed"));
    }
  }, [t]);

  const handleConfirm = useCallback(async () => {
    if (confirmCode.length !== 6) return;
    setConfirming(true);
    try {
      await confirmTOTP(confirmCode);
      setEnabled(true);
      setSetup(null);
      toast.success(t("security.totpEnabled"));
    } catch {
      toast.error(t("security.invalidCode"));
    } finally {
      setConfirming(false);
    }
  }, [confirmCode, t]);

  const handleDisable = useCallback(async () => {
    setDisabling(true);
    try {
      await disableTOTP();
      setEnabled(false);
      toast.success(t("security.totpDisabled"));
    } catch {
      toast.error(t("security.disableFailed"));
    } finally {
      setDisabling(false);
    }
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 size={14} className="animate-spin text-tertiary" />
        <span className="text-xs text-tertiary">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
        <Smartphone size={14} />
        {t("security.twoFactor")}
      </h3>
      <p className="text-xs leading-relaxed text-secondary">
        {t("security.twoFactorDesc")}
      </p>

      {enabled && !setup && (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-success"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.08)",
              border: "1px solid rgba(34, 197, 94, 0.2)",
            }}
          >
            <Shield size={13} />
            {t("security.totpActive")}
          </div>
          <button
            onClick={handleDisable}
            disabled={disabling}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors text-danger border-secondary"
          >
            {disabling ? t("security.disabling") : t("security.disableTotp")}
          </button>
        </div>
      )}

      {!enabled && !setup && (
        <button
          onClick={handleSetup}
          className="text-xs font-medium px-4 py-2 rounded-md transition-colors bg-accent text-white"
        >
          {t("security.enableTotp")}
        </button>
      )}

      {setup && (
        <div className="space-y-4 p-4 rounded-lg bg-secondary border-secondary">
          <p className="text-xs text-secondary">
            {t("security.scanQR")}
          </p>

          {/* QR Code via Google Charts API */}
          <div className="flex justify-center">
            <img
              src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(setup.url)}&choe=UTF-8`}
              alt="TOTP QR Code"
              width={200}
              height={200}
              className="rounded-lg"
              style={{ backgroundColor: "white", padding: 8 }}
            />
          </div>

          {/* Manual secret */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-tertiary">
              {t("security.manualEntry")}
            </label>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md font-mono text-xs select-all bg-tertiary text-primary"
              style={{ letterSpacing: "0.05em" }}
            >
              {setup.secret}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(setup.secret);
                  toast.success(t("pgp.copied"));
                }}
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] ml-auto shrink-0 text-tertiary"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          {/* Confirm code */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-tertiary">
              {t("security.enterCode")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="000000"
                autoFocus
                className="w-32 h-9 px-3 text-center font-mono text-sm tracking-[0.3em] rounded-md outline-none bg-elevated text-primary border-primary"
              />
              <button
                onClick={handleConfirm}
                disabled={confirmCode.length !== 6 || confirming}
                className="h-9 px-4 text-xs font-medium rounded-md transition-colors disabled:opacity-40 bg-accent text-white"
              >
                {confirming ? <Loader2 size={13} className="animate-spin" /> : t("security.verify")}
              </button>
            </div>
          </div>

          <button
            onClick={() => setSetup(null)}
            className="text-xs text-tertiary"
          >
            {t("security.cancelSetup")}
          </button>
        </div>
      )}
    </div>
  );
}

// --- App Passwords Section ---

function AppPasswordsSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState<AppPassword[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(true);

  const fetchPasswords = useCallback(async () => {
    try {
      const list = await listAppPasswords();
      setPasswords(list);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasswords();
  }, [fetchPasswords]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await createAppPassword(newName.trim());
      setNewPassword(result.password);
      setNewName("");
      fetchPasswords();
    } catch {
      toast.error(t("security.appPasswordFailed"));
    } finally {
      setCreating(false);
    }
  }, [newName, t, fetchPasswords]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteAppPassword(id);
      setPasswords((prev) => prev.filter((p) => p.id !== id));
      toast.success(t("security.appPasswordDeleted"));
    } catch {
      toast.error(t("security.deleteFailed"));
    }
  }, [t]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
        <Key size={14} />
        {t("security.appPasswords")}
      </h3>
      <p className="text-xs leading-relaxed text-secondary">
        {t("security.appPasswordsDesc")}
      </p>

      {/* Newly created password (shown once) */}
      {newPassword && (
        <div
          className="p-3 rounded-lg space-y-2"
          style={{
            backgroundColor: "rgba(59, 130, 246, 0.06)",
            border: "1px solid rgba(59, 130, 246, 0.15)",
          }}
        >
          <p className="text-xs font-medium text-accent">
            {t("security.passwordCreated")}
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 text-sm font-mono px-3 py-2 rounded-md select-all bg-elevated text-primary"
              style={{ letterSpacing: "0.02em" }}
            >
              {showNewPassword ? newPassword : "••••-••••-••••-••••-••••-••••-••••-••••"}
            </code>
            <button
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] text-secondary"
            >
              {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newPassword);
                toast.success(t("pgp.copied"));
              }}
              className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] text-secondary"
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="text-[11px] text-tertiary">
            {t("security.passwordOnce")}
          </p>
          <button
            onClick={() => setNewPassword(null)}
            className="text-xs font-medium px-3 py-1 rounded-md text-accent border-secondary"
          >
            {t("security.done")}
          </button>
        </div>
      )}

      {/* Create new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder={t("security.appNamePlaceholder")}
          className="flex-1 h-8 px-3 text-xs rounded-md outline-none bg-tertiary text-primary border-secondary"
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim() || creating}
          className="h-8 px-3 text-xs font-medium rounded-md transition-colors disabled:opacity-40 flex items-center gap-1.5 bg-accent text-white"
        >
          <Plus size={13} />
          {creating ? <Loader2 size={13} className="animate-spin" /> : t("security.generate")}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-xs py-2 text-tertiary">Loading...</div>
      ) : passwords.length === 0 ? (
        <div className="text-xs py-3 text-center text-tertiary">
          {t("security.noAppPasswords")}
        </div>
      ) : (
        <div className="space-y-1">
          {passwords.map((pw) => (
            <div
              key={pw.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary border-secondary"
            >
              <Key size={13} className="text-tertiary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-primary">
                  {pw.name}
                </div>
                <div className="text-[11px] text-tertiary">
                  {new Date(pw.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => handleDelete(pw.id)}
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-danger"
                title={t("security.revoke")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
