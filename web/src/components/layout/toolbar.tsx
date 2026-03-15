/** Top toolbar with search, compose, and theme toggle — premium design */

import React, { useCallback } from "react";
import {
  PenSquare,
  Sun,
  Moon,
  Monitor,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { SearchBar } from "@/components/mail/search-bar.tsx";
import { useTheme } from "@/hooks/use-theme.ts";
import { nextTheme } from "@/lib/theme.ts";
import { useUIStore } from "@/stores/ui-store.ts";
import { logout } from "@/api/client.ts";
import * as Tooltip from "@radix-ui/react-tooltip";

interface ToolbarProps {
  onCompose?: () => void;
  onSearch?: (query: string) => void;
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
  onCompose,
  onSettings,
  onAdvancedSearch,
}: ToolbarProps) {
  const { theme, setTheme } = useTheme();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isMobile = useUIStore((s) => s.isMobile);

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
        {/* Mobile menu toggle */}
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Toggle sidebar menu"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Logo / App name */}
        <div
          className="font-semibold text-sm tracking-tight select-none"
          style={{ color: "var(--color-text-accent)" }}
        >
          Webmail
        </div>

        {/* Search bar */}
        <SearchBar onAdvancedSearch={onAdvancedSearch} />

        {/* Separator */}
        <div
          className="h-5 w-px shrink-0"
          style={{ backgroundColor: "var(--color-border-primary)" }}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          {/* Compose */}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={onCompose}
                className="flex items-center gap-1.5 h-8 px-3.5 text-sm font-medium transition-all duration-150"
                style={{
                  backgroundColor: "var(--color-bg-accent)",
                  color: "var(--color-text-inverse)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "0 1px 3px rgba(99, 102, 241, 0.15)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-accent-hover)";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(99, 102, 241, 0.25)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-accent)";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(99, 102, 241, 0.15)";
                }}
              >
                <PenSquare size={15} />
                {!isMobile && <span>Compose</span>}
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
              Compose (C)
            </Tooltip.Content>
          </Tooltip.Root>

          {/* Theme toggle */}
          <ToolbarIconButton
            onClick={handleThemeToggle}
            icon={<ThemeIcon size={17} />}
            label={`Theme: ${theme}. Click to change.`}
            tooltipText={`Theme: ${theme}`}
          />

          {/* Settings */}
          <ToolbarIconButton
            onClick={onSettings}
            icon={<Settings size={17} />}
            label="Settings"
            tooltipText="Settings"
          />

          {/* Logout */}
          <ToolbarIconButton
            onClick={handleLogout}
            icon={<LogOut size={17} />}
            label="Log out"
            tooltipText="Log out"
          />
        </div>
      </div>
    </Tooltip.Provider>
  );
});
