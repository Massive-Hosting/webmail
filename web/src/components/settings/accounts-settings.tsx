/** Accounts settings: current account info and delegate access placeholder */

import React from "react";
import { Mail, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store.ts";

export const AccountsSettings = React.memo(function AccountsSettings() {
  const { t } = useTranslation();
  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);

  return (
    <div className="p-6 space-y-6">
      {/* Current account */}
      <div className="space-y-2">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("accounts.currentAccount")}
        </h3>
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-secondary)",
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              color: "white",
            }}
          >
            <Mail size={16} />
          </div>
          <div className="min-w-0">
            {displayName && displayName !== email && (
              <div
                className="text-sm font-medium truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {displayName}
              </div>
            )}
            <div
              className="text-xs truncate"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {email}
            </div>
          </div>
        </div>
      </div>

      {/* Delegate access */}
      <div className="space-y-2">
        <h3
          className="text-sm font-semibold flex items-center gap-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          <Users size={14} />
          {t("accounts.delegateAccess")}
        </h3>
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {t("accounts.delegateDesc")}
        </p>
      </div>
    </div>
  );
});
