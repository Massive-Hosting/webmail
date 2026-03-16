/** Settings dialog with vertical tabs for all settings sections */

import React from "react";
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
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterRulesPanel } from "./filter-rules.tsx";
import { PGPSettingsPanel } from "./pgp-settings.tsx";
import { GeneralSettings } from "./general-settings.tsx";
import { MailSettings } from "./mail-settings.tsx";
import { SignatureSettings } from "./signature-settings.tsx";
import { KeyboardSettings } from "./keyboard-settings.tsx";
import { NotificationSettings } from "./notification-settings.tsx";
import { StorageSettings } from "./storage-settings.tsx";
import { VacationSettings } from "./vacation-settings.tsx";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: string;
}

export const SettingsDialog = React.memo(function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "general",
}: SettingsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg max-w-[900px] w-[90vw] h-[80vh] overflow-hidden flex flex-col animate-scale-in"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-xl)",
          }}
          aria-labelledby="settings-title"
        >
          <div
            className="flex items-center justify-between px-6 py-4 shrink-0"
            style={{ borderBottom: "1px solid var(--color-border-primary)" }}
          >
            <Dialog.Title
              id="settings-title"
              className="flex items-center gap-2 text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              <Settings size={20} />
              {t("settingsDialog.title")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label={t("settingsDialog.close")}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root defaultValue={initialTab} className="flex-1 overflow-hidden flex flex-row" orientation="vertical">
            <Tabs.List
              className="flex flex-col gap-0.5 py-2 px-2 shrink-0 overflow-y-auto"
              style={{
                borderRight: "1px solid var(--color-border-secondary)",
                width: "210px",
              }}
              aria-label={t("settingsDialog.sections")}
            >
              <TabTrigger value="general">
                <Palette size={14} />
                {t("settingsDialog.general")}
              </TabTrigger>
              <TabTrigger value="mail">
                <Mail size={14} />
                {t("settingsDialog.mail")}
              </TabTrigger>
              <TabTrigger value="signatures">
                <PenLine size={14} />
                {t("settingsDialog.signatures")}
              </TabTrigger>
              <TabTrigger value="vacation">
                <Palmtree size={14} />
                {t("settingsDialog.vacation")}
              </TabTrigger>
              <TabTrigger value="filters">
                <Filter size={14} />
                {t("settingsDialog.filters")}
              </TabTrigger>
              <TabTrigger value="shortcuts">
                <Keyboard size={14} />
                {t("settingsDialog.shortcuts")}
              </TabTrigger>
              <TabTrigger value="notifications">
                <Bell size={14} />
                {t("settingsDialog.notifications")}
              </TabTrigger>
              <TabTrigger value="storage">
                <HardDrive size={14} />
                {t("settingsDialog.storage")}
              </TabTrigger>
              <TabTrigger value="security">
                <Shield size={14} />
                {t("settingsDialog.security")}
              </TabTrigger>
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
                <PGPSettingsPanel />
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
      className="settings-tab flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap text-left w-full"
      style={{
        color: "var(--color-text-secondary)",
      }}
    >
      {children}
    </Tabs.Trigger>
  );
}
