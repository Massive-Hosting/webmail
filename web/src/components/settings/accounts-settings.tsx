/** Accounts settings: current account info, shared resources, and domain settings */

import React, { useState, useEffect } from "react";
import { Mail, Users, Folder, BookOpen, Calendar, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useAddressBooks } from "@/hooks/use-contacts.ts";
import { useQuery } from "@tanstack/react-query";
import { fetchCalendars } from "@/api/calendar.ts";
import { getDomainSettings } from "@/api/availability.ts";

export const AccountsSettings = React.memo(function AccountsSettings() {
  const { t } = useTranslation();
  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);
  const { mailboxes } = useMailboxes();
  const { addressBooks } = useAddressBooks();
  const { data: calendars } = useQuery({
    queryKey: ["calendars"],
    queryFn: fetchCalendars,
    staleTime: 5 * 60 * 1000,
  });

  // Collect all shared resources
  const sharedMailboxes = mailboxes.filter(
    (m) => m.shareWith && Object.keys(m.shareWith).length > 0,
  );
  const sharedAddressBooks = addressBooks.filter(
    (b) => b.shareWith && Object.keys(b.shareWith).length > 0,
  );
  const sharedCalendars = (calendars ?? []).filter(
    (c) => c.shareWith && Object.keys(c.shareWith).length > 0,
  );

  const hasSharedResources = sharedMailboxes.length > 0 || sharedAddressBooks.length > 0 || sharedCalendars.length > 0;

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

      {/* Shared resources */}
      <div className="space-y-2">
        <h3
          className="text-sm font-semibold flex items-center gap-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          <Users size={14} />
          {t("accounts.sharedResources")}
        </h3>
        {!hasSharedResources ? (
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("accounts.noSharedResources")}
          </p>
        ) : (
          <div className="space-y-1.5">
            {sharedMailboxes.map((m) => (
              <SharedResourceItem
                key={m.id}
                icon={<Folder size={13} />}
                name={m.name}
                sharedWith={Object.keys(m.shareWith!)}
              />
            ))}
            {sharedAddressBooks.map((b) => (
              <SharedResourceItem
                key={b.id}
                icon={<BookOpen size={13} />}
                name={b.name}
                sharedWith={Object.keys(b.shareWith!)}
              />
            ))}
            {sharedCalendars.map((c) => (
              <SharedResourceItem
                key={c.id}
                icon={<Calendar size={13} />}
                name={c.name}
                sharedWith={Object.keys(c.shareWith!)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Domain settings */}
      <DomainSettingsSection />
    </div>
  );
});

function DomainSettingsSection() {
  const { t } = useTranslation();
  const [freebusyEnabled, setFreebusyEnabled] = useState(false);
  const [directoryEnabled, setDirectoryEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDomainSettings()
      .then((ds) => {
        setFreebusyEnabled(ds.freebusyEnabled);
        setDirectoryEnabled(ds.directoryEnabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!freebusyEnabled && !directoryEnabled) return null;

  return (
    <div className="space-y-2">
      <h3
        className="text-sm font-semibold flex items-center gap-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        <Building2 size={14} />
        {t("accounts.organizationFeatures")}
      </h3>
      <div
        className="rounded-lg p-3 space-y-2"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-secondary)",
        }}
      >
        {freebusyEnabled && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "var(--color-bg-success)" }} />
            {t("accounts.freeBusy")}
          </div>
        )}
        {directoryEnabled && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "var(--color-bg-success)" }} />
            {t("accounts.directory")}
          </div>
        )}
      </div>
    </div>
  );
}

function SharedResourceItem({
  icon,
  name,
  sharedWith,
}: {
  icon: React.ReactNode;
  name: string;
  sharedWith: string[];
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-md"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        border: "1px solid var(--color-border-secondary)",
      }}
    >
      <span style={{ color: "var(--color-text-tertiary)" }}>{icon}</span>
      <span
        className="text-xs font-medium truncate"
        style={{ color: "var(--color-text-primary)" }}
      >
        {name}
      </span>
      <span
        className="text-[11px] ml-auto shrink-0"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {sharedWith.length === 1
          ? sharedWith[0]
          : `${sharedWith.length} people`}
      </span>
    </div>
  );
}
