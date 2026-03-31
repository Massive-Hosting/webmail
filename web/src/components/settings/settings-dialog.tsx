/** Settings dialog with vertical tabs for all settings sections */

import React, { useState, useEffect, useMemo, startTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  X,
  Settings,
  Palette,
  Mail,
  PenLine,
  Filter,
  Keyboard,
  Bell,
  HardDrive,
  Shield,
  Palmtree,
  Users,
  FileText,
  Search,
  Download,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterRulesPanel } from "./filter-rules.tsx";
import { SecuritySettings } from "./security-settings.tsx";
import { GeneralSettings } from "./general-settings.tsx";
import { MailSettings } from "./mail-settings.tsx";
import { SignatureSettings } from "./signature-settings.tsx";
import { KeyboardSettings } from "./keyboard-settings.tsx";
import { NotificationSettings } from "./notification-settings.tsx";
import { StorageSettings } from "./storage-settings.tsx";
import { VacationSettings } from "./vacation-settings.tsx";
import { AccountsSettings } from "./accounts-settings.tsx";
import { TemplateSettings } from "./template-settings.tsx";
import { ImportSettings } from "./import-settings.tsx";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: string;
}

const SETTINGS_SEARCH_INDEX: Record<string, string[]> = {
  general: ["general", "theme", "density", "start page", "language", "appearance"],
  mail: ["mail", "conversation", "reading pane", "archive", "delete", "mark as read", "undo send", "reply", "external images"],
  signatures: ["signatures", "identity", "email signature"],
  templates: ["templates", "email templates"],
  vacation: ["vacation", "out of office", "auto reply", "automatic reply"],
  filters: ["filters", "rules", "sieve"],
  shortcuts: ["shortcuts", "keyboard", "hotkeys"],
  notifications: ["notifications", "desktop", "sound", "alerts"],
  storage: ["storage", "quota", "space", "trash", "junk"],
  security: ["security", "two-factor", "2fa", "totp", "app passwords"],
  accounts: ["accounts", "shared", "organization", "free busy", "directory"],
  import: ["import", "imap", "migrate", "transfer", "gmail", "outlook", "yahoo"],
};

const ALL_TABS = [
  "general", "mail", "signatures", "templates", "vacation",
  "filters", "shortcuts", "notifications", "storage", "security", "accounts", "import",
];

export const SettingsDialog = React.memo(function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "general",
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);

  // Reset search and tab when dialog opens
  useEffect(() => {
    if (open) {
      startTransition(() => {
        setSearchTerm("");
        setActiveTab(initialTab);
      });
    }
  }, [open, initialTab]);

  const visibleTabs = useMemo(() => {
    if (!searchTerm.trim()) return ALL_TABS;
    const term = searchTerm.toLowerCase();
    return ALL_TABS.filter((tab) =>
      SETTINGS_SEARCH_INDEX[tab]?.some((keyword) => keyword.includes(term))
    );
  }, [searchTerm]);

  // Auto-switch to first matching tab when search changes
  useEffect(() => {
    if (searchTerm.trim() && visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      startTransition(() => setActiveTab(visibleTabs[0]));
    }
  }, [searchTerm, visibleTabs, activeTab]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 dialog-overlay"
        />
        <Dialog.Content
          className="max-w-[900px] w-[90vw] h-[80vh] dialog-content border-primary"
          aria-labelledby="settings-title"
        >
          <div
            className="flex items-center justify-between px-6 py-4 shrink-0 dialog-header"
          >
            <Dialog.Title
              id="settings-title"
              className="flex items-center gap-2 text-lg font-semibold text-primary"
            >
              <Settings size={20} />
              {t("settingsDialog.title")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-secondary"
                aria-label={t("settingsDialog.close")}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-row" orientation="vertical">
            <Tabs.List
              className="flex flex-col gap-0.5 py-2 px-2 shrink-0 overflow-y-auto"
              style={{
                borderRight: "1px solid var(--color-border-secondary)",
                width: "210px",
              }}
              aria-label={t("settingsDialog.sections")}
            >
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded-md text-sm bg-primary border-primary text-secondary"
              >
                <Search size={14} style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("settingsDialog.searchPlaceholder", { defaultValue: "Search settings..." })}
                  className="border-none outline-none text-sm w-full text-primary"
                  style={{ backgroundColor: "transparent", borderRadius: 0 }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="p-0.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-tertiary"
                    style={{ flexShrink: 0 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {visibleTabs.includes("general") && (
                <TabTrigger value="general">
                  <Palette size={14} />
                  {t("settingsDialog.general")}
                </TabTrigger>
              )}
              {visibleTabs.includes("mail") && (
                <TabTrigger value="mail">
                  <Mail size={14} />
                  {t("settingsDialog.mail")}
                </TabTrigger>
              )}
              {visibleTabs.includes("signatures") && (
                <TabTrigger value="signatures">
                  <PenLine size={14} />
                  {t("settingsDialog.signatures")}
                </TabTrigger>
              )}
              {visibleTabs.includes("templates") && (
                <TabTrigger value="templates">
                  <FileText size={14} />
                  {t("settingsDialog.templates")}
                </TabTrigger>
              )}
              {visibleTabs.includes("vacation") && (
                <TabTrigger value="vacation">
                  <Palmtree size={14} />
                  {t("settingsDialog.vacation")}
                </TabTrigger>
              )}
              {visibleTabs.includes("filters") && (
                <TabTrigger value="filters">
                  <Filter size={14} />
                  {t("settingsDialog.filters")}
                </TabTrigger>
              )}
              {visibleTabs.includes("shortcuts") && (
                <TabTrigger value="shortcuts">
                  <Keyboard size={14} />
                  {t("settingsDialog.shortcuts")}
                </TabTrigger>
              )}
              {visibleTabs.includes("notifications") && (
                <TabTrigger value="notifications">
                  <Bell size={14} />
                  {t("settingsDialog.notifications")}
                </TabTrigger>
              )}
              {visibleTabs.includes("storage") && (
                <TabTrigger value="storage">
                  <HardDrive size={14} />
                  {t("settingsDialog.storage")}
                </TabTrigger>
              )}
              {visibleTabs.includes("security") && (
                <TabTrigger value="security">
                  <Shield size={14} />
                  {t("settingsDialog.security")}
                </TabTrigger>
              )}
              {visibleTabs.includes("accounts") && (
                <TabTrigger value="accounts">
                  <Users size={14} />
                  {t("settingsDialog.accounts")}
                </TabTrigger>
              )}
              {visibleTabs.includes("import") && (
                <TabTrigger value="import">
                  <Download size={14} />
                  {t("settingsDialog.import")}
                </TabTrigger>
              )}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto">
              <Tabs.Content value="general">
                <GeneralSettings />
              </Tabs.Content>
              <Tabs.Content value="mail">
                <MailSettings />
              </Tabs.Content>
              <Tabs.Content value="signatures">
                <SignatureSettings />
              </Tabs.Content>
              <Tabs.Content value="templates">
                <TemplateSettings />
              </Tabs.Content>
              <Tabs.Content value="vacation">
                <VacationSettings />
              </Tabs.Content>
              <Tabs.Content value="filters">
                <FilterRulesPanel />
              </Tabs.Content>
              <Tabs.Content value="shortcuts">
                <KeyboardSettings />
              </Tabs.Content>
              <Tabs.Content value="notifications">
                <NotificationSettings />
              </Tabs.Content>
              <Tabs.Content value="storage">
                <StorageSettings />
              </Tabs.Content>
              <Tabs.Content value="security">
                <SecuritySettings />
              </Tabs.Content>
              <Tabs.Content value="accounts">
                <AccountsSettings />
              </Tabs.Content>
              <Tabs.Content value="import">
                <ImportSettings />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

function TabTrigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="settings-tab flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap text-left w-full text-secondary"
    >
      {children}
    </Tabs.Trigger>
  );
}
