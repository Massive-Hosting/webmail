/** Auth state store: user email, display name, account ID */

import { create } from "zustand";

interface AuthState {
  email: string;
  displayName: string;
  accountId: string;
  setSession: (email: string, accountId: string) => void;
}

/** Derive initials from email or display name */
export function getUserInitials(displayName: string, email: string): string {
  if (displayName && displayName !== email) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  // Derive from email local part
  const local = email.split("@")[0] || "";
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return local.toUpperCase() || "?";
}

export const useAuthStore = create<AuthState>((set) => ({
  email: "",
  displayName: "",
  accountId: "",
  setSession: (email, accountId) => {
    set({ email, accountId, displayName: "" });
  },
}));
