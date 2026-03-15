/** Top toolbar with search, theme toggle, settings, and user avatar menu */

import React, { useCallback } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Settings,
  LogOut,
  ChevronDown,
  Globe,
} from "lucide-react";
import { SearchBar } from "@/components/mail/search-bar.tsx";
import { useTheme } from "@/hooks/use-theme.ts";
import { nextTheme } from "@/lib/theme.ts";
import { logout } from "@/api/client.ts";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslation } from "react-i18next";
import { useAuthStore, getUserInitials } from "@/stores/auth-store.ts";
import { getAvatarColor } from "@/lib/format.ts";
import { LANGUAGES } from "@/i18n/index.ts";

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
  const { t, i18n } = useTranslation();

  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);

  const initials = getUserInitials(displayName, email);
  const avatarColor = getAvatarColor(email);
  const shownName = displayName || email.split("@")[0] || email;

  const handleThemeToggle = useCallback(() => {
    setTheme(nextTheme(theme));
  }, [theme, setTheme]);

  const handleLogout = useCallback(async () => {
    await logout();
    window.location.href = "/login";
  }, []);

  const handleLanguageChange = useCallback(
    (code: string) => {
      i18n.changeLanguage(code);
    },
    [i18n],
  );

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

          {/* User avatar dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex items-center gap-1.5 rounded-md px-1 py-1 transition-all duration-150 hover:bg-[var(--color-bg-tertiary)]"
                aria-label={t("toolbar.userMenu")}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: avatarColor,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                  }}
                >
                  {initials}
                </div>
                <ChevronDown
                  size={14}
                  style={{ color: "var(--color-text-secondary)" }}
                />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[220px] rounded-lg py-1 animate-scale-in"
                style={{
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-primary)",
                  boxShadow: "var(--shadow-lg)",
                }}
                sideOffset={6}
                align="end"
              >
                {/* User info header */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
                >
                  <div
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor: avatarColor,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {shownName}
                    </span>
                    <span
                      className="text-xs truncate"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {email}
                    </span>
                  </div>
                </div>

                {/* Settings */}
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-[var(--color-bg-tertiary)]"
                  style={{ color: "var(--color-text-primary)" }}
                  onSelect={() => onSettings?.()}
                >
                  <Settings size={15} style={{ color: "var(--color-text-secondary)" }} />
                  {t("toolbar.settings")}
                </DropdownMenu.Item>

                {/* Language sub-menu */}
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger
                    className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-[var(--color-bg-tertiary)]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    <span className="flex items-center gap-2">
                      <Globe size={15} style={{ color: "var(--color-text-secondary)" }} />
                      {t("settings.language")}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {LANGUAGES.find((l) => l.code === i18n.language)?.label ??
                        i18n.language}
                    </span>
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      className="z-50 min-w-[140px] rounded-lg py-1 animate-scale-in"
                      style={{
                        backgroundColor: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-primary)",
                        boxShadow: "var(--shadow-lg)",
                      }}
                      sideOffset={4}
                    >
                      {LANGUAGES.map((lang) => (
                        <DropdownMenu.Item
                          key={lang.code}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-[var(--color-bg-tertiary)]"
                          style={{
                            color:
                              i18n.language === lang.code
                                ? "var(--color-text-accent)"
                                : "var(--color-text-primary)",
                            fontWeight: i18n.language === lang.code ? 600 : 400,
                          }}
                          onSelect={() => handleLanguageChange(lang.code)}
                        >
                          {lang.label}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>

                <DropdownMenu.Separator
                  className="h-px my-1"
                  style={{ backgroundColor: "var(--color-border-secondary)" }}
                />

                {/* Sign out */}
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-[var(--color-bg-tertiary)]"
                  style={{ color: "var(--color-text-primary)" }}
                  onSelect={handleLogout}
                >
                  <LogOut size={15} style={{ color: "var(--color-text-secondary)" }} />
                  {t("toolbar.logOut")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );
});
