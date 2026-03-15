/**
 * Zustand store for tracking JMAP state strings.
 * Used for delta sync: when a WebSocket state change arrives,
 * we compare against the stored state and call the JMAP changes method if different.
 */

import { create } from "zustand";

interface JMAPStateStore {
  /** Last known Email state string from JMAP responses */
  emailState: string | null;
  /** Last known Mailbox state string from JMAP responses */
  mailboxState: string | null;

  setEmailState: (state: string) => void;
  setMailboxState: (state: string) => void;
  reset: () => void;
}

export const useJMAPStateStore = create<JMAPStateStore>((set) => ({
  emailState: null,
  mailboxState: null,

  setEmailState: (state: string) => set({ emailState: state }),
  setMailboxState: (state: string) => set({ mailboxState: state }),
  reset: () => set({ emailState: null, mailboxState: null }),
}));
