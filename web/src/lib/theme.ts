/** Theme constants and utilities */

import type { ThemeMode } from "@/stores/settings-store.ts";

/** Resolve the effective theme (light or dark) from the mode setting */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

/** Get the next theme in the cycle: system -> light -> dark -> system */
export function nextTheme(current: ThemeMode): ThemeMode {
  switch (current) {
    case "system":
      return "light";
    case "light":
      return "dark";
    case "dark":
      return "system";
  }
}
