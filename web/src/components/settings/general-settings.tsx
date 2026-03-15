/** General settings: theme, density, start page */

import React from "react";
import { Sun, Moon, Monitor, Minimize2, Maximize2 } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store.ts";
import type { ThemeMode, DensityMode, StartPage } from "@/stores/settings-store.ts";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@/i18n/index.ts";
import { StyledSelect } from "@/components/ui/styled-select.tsx";

export const GeneralSettings = React.memo(function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const density = useSettingsStore((s) => s.density);
  const startPage = useSettingsStore((s) => s.startPage);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setDensity = useSettingsStore((s) => s.setDensity);
  const setStartPage = useSettingsStore((s) => s.setStartPage);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  return (
    <div className="p-6 space-y-6">
      {/* Language */}
      <SettingSection title={t("settings.language")} description={t("settings.languageDesc")}>
        <StyledSelect
          value={i18n.language?.split("-")[0] ?? "en"}
          onValueChange={(v) => {
            i18n.changeLanguage(v);
            localStorage.setItem("language", v);
          }}
          options={LANGUAGES.map((lang) => ({
            value: lang.code,
            label: lang.label,
          }))}
        />
      </SettingSection>

      {/* Theme */}
      <SettingSection title={t("settings.theme")} description={t("settings.themeDesc")}>
        <div className="flex gap-2">
          <ThemeButton
            mode="system"
            label={t("settings.system")}
            icon={<Monitor size={16} />}
            active={theme === "system"}
            onClick={() => setTheme("system")}
          />
          <ThemeButton
            mode="light"
            label={t("settings.light")}
            icon={<Sun size={16} />}
            active={theme === "light"}
            onClick={() => setTheme("light")}
          />
          <ThemeButton
            mode="dark"
            label={t("settings.dark")}
            icon={<Moon size={16} />}
            active={theme === "dark"}
            onClick={() => setTheme("dark")}
          />
        </div>
      </SettingSection>

      {/* Density */}
      <SettingSection title={t("settings.density")} description={t("settings.densityDesc")}>
        <div className="flex gap-2">
          <DensityButton
            mode="comfortable"
            label={t("settings.comfortable")}
            icon={<Maximize2 size={16} />}
            active={density === "comfortable"}
            onClick={() => setDensity("comfortable")}
          />
          <DensityButton
            mode="compact"
            label={t("settings.compact")}
            icon={<Minimize2 size={16} />}
            active={density === "compact"}
            onClick={() => setDensity("compact")}
          />
        </div>
      </SettingSection>

      {/* Start page */}
      <SettingSection title={t("settings.startPage")} description={t("settings.startPageDesc")}>
        <div className="flex gap-2">
          <OptionButton
            label={t("settings.inbox")}
            active={startPage === "inbox"}
            onClick={() => setStartPage("inbox")}
          />
          <OptionButton
            label={t("settings.lastViewed")}
            active={startPage === "last"}
            onClick={() => setStartPage("last")}
          />
        </div>
      </SettingSection>

      {/* Reset */}
      <div className="pt-4" style={{ borderTop: "1px solid var(--color-border-secondary)" }}>
        <button
          onClick={resetToDefaults}
          className="text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-danger)" }}
        >
          {t("settings.restoreDefaults")}
        </button>
      </div>
    </div>
  );
});

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3
        className="text-sm font-semibold mb-0.5"
        style={{ color: "var(--color-text-primary)" }}
      >
        {title}
      </h3>
      <p
        className="text-xs mb-3"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {description}
      </p>
      {children}
    </div>
  );
}

function ThemeButton({
  mode,
  label,
  icon,
  active,
  onClick,
}: {
  mode: ThemeMode;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors"
      style={{
        backgroundColor: active ? "var(--color-bg-accent)" : "var(--color-bg-tertiary)",
        color: active ? "var(--color-text-inverse)" : "var(--color-text-primary)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function DensityButton({
  mode,
  label,
  icon,
  active,
  onClick,
}: {
  mode: DensityMode;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors"
      style={{
        backgroundColor: active ? "var(--color-bg-accent)" : "var(--color-bg-tertiary)",
        color: active ? "var(--color-text-inverse)" : "var(--color-text-primary)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function OptionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm rounded-md transition-colors"
      style={{
        backgroundColor: active ? "var(--color-bg-accent)" : "var(--color-bg-tertiary)",
        color: active ? "var(--color-text-inverse)" : "var(--color-text-primary)",
      }}
    >
      {label}
    </button>
  );
}
