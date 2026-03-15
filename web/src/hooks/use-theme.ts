/** Theme toggle hook with System/Light/Dark modes */

import { useEffect } from "react";
import { useSettingsStore, applyTheme, applyDensity } from "@/stores/settings-store.ts";

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const density = useSettingsStore((s) => s.density);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // Apply theme on mount and when changed
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Apply density on mount and when changed
  useEffect(() => {
    applyDensity(density);
  }, [density]);

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
