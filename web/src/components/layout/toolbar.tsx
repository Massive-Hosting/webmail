/** Top toolbar with search, theme toggle, settings, and logout — premium design */

import React, { useCallback } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Settings,
  LogOut,
} from "lucide-react";
import { SearchBar } from "@/components/mail/search-bar.tsx";
import { useTheme } from "@/hooks/use-theme.ts";
import { nextTheme } from "@/lib/theme.ts";
import { logout } from "@/api/client.ts";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";

interface ToolbarProps {
  onSettings?: () => void;
  onAdvancedSearch?: () => void;
}

/** Reusable toolbar icon button with tooltip */
function ToolbarIconButton({
  onClick,
  icon,
  label,
  tooltipText,
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  tooltipText: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={label}
          onMouseOver={(e) => {
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content
        className="text-xs px-2.5 py-1.5 animate-scale-in"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--color-border-primary)",
          borderRadius: "var(--radius-sm)",
          fontWeight: 500,
        }}
        sideOffset={6}
      >
        {tooltipText}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

export const Toolbar = React.memo(function Toolbar({
  onSettings,
  onAdvancedSearch,
}: ToolbarProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const handleThemeToggle = useCallback(() => {
    setTheme(nextTheme(theme));
  }, [theme, setTheme]);

  const handleLogout = useCallback(async () => {
    await logout();
    window.location.href = "/login";
  }, []);

  const ThemeIcon =
    theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <Tooltip.Provider delayDuration={400}>
      <div
        className="flex items-center gap-3 px-3 shrink-0"
        style={{
          height: "var(--density-toolbar)",
          backgroundColor: "var(--color-bg-secondary)",
          borderBottom: "1px solid var(--color-border-primary)",
        }}
      >
        {/* Search bar */}
        <SearchBar onAdvancedSearch={onAdvancedSearch} />

        {/* Spacer */}
        <div className="flex-grow" />

        {/* Right-aligned actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Theme toggle */}
          <ToolbarIconButton
            onClick={handleThemeToggle}
            icon={<ThemeIcon size={19} />}
            label={t("toolbar.themeClick", { theme })}
            tooltipText={t("toolbar.theme", { theme })}
          />

          {/* Settings */}
          <ToolbarIconButton
            onClick={onSettings}
            icon={<Settings size={19} />}
            label={t("toolbar.settings")}
            tooltipText={t("toolbar.settings")}
          />

          {/* Separator */}
          <div
            className="h-5 w-px shrink-0 mx-1"
            style={{ backgroundColor: "var(--color-border-primary)" }}
          />

          {/* Logout - subtle styling */}
          <ToolbarIconButton
            onClick={handleLogout}
            icon={<LogOut size={18} />}
            label={t("toolbar.logOut")}
            tooltipText={t("toolbar.logOut")}
          />
        </div>
      </div>
    </Tooltip.Provider>
  );
});
