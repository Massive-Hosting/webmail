/** Top toolbar with search, compose, and theme toggle */

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
    <Tooltip.Provider delayDuration={300}>
      <div
        className="flex items-center gap-2 px-3 shrink-0"
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
            className="p-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Toggle sidebar menu"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Logo / App name */}
        <div
          className="font-semibold text-sm mr-2"
          style={{ color: "var(--color-text-accent)" }}
        >
          Webmail
        </div>

        {/* Search bar */}
        <SearchBar onAdvancedSearch={onAdvancedSearch} />

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-2">
          {/* Compose */}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={onCompose}
                className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md transition-colors duration-150"
                style={{
                  backgroundColor: "var(--color-bg-accent)",
                  color: "var(--color-text-inverse)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-accent-hover)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-accent)";
                }}
              >
                <PenSquare size={16} />
                {!isMobile && <span>Compose</span>}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
                boxShadow: "var(--shadow-md)",
                border: "1px solid var(--color-border-primary)",
              }}
              sideOffset={5}
            >
              Compose (C)
            </Tooltip.Content>
          </Tooltip.Root>

          {/* Theme toggle */}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleThemeToggle}
                className="p-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label={`Theme: ${theme}. Click to change.`}
              >
                <ThemeIcon size={18} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
                boxShadow: "var(--shadow-md)",
                border: "1px solid var(--color-border-primary)",
              }}
              sideOffset={5}
            >
              Theme: {theme}
            </Tooltip.Content>
          </Tooltip.Root>

          {/* Settings */}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={onSettings}
                className="p-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label="Settings"
              >
                <Settings size={18} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
                boxShadow: "var(--shadow-md)",
                border: "1px solid var(--color-border-primary)",
              }}
              sideOffset={5}
            >
              Settings
            </Tooltip.Content>
          </Tooltip.Root>

          {/* Logout */}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleLogout}
                className="p-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label="Log out"
              >
                <LogOut size={18} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
                boxShadow: "var(--shadow-md)",
                border: "1px solid var(--color-border-primary)",
              }}
              sideOffset={5}
            >
              Log out
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );
});
