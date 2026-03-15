/** Compose/draft state management */

import { create } from "zustand";
import type { EmailAddress, Identity } from "@/types/mail.ts";

export interface Recipient {
  name: string | null;
  email: string;
  isValid: boolean;
}

export interface AttachmentState {
  id: string; // client-generated ID
  blobId?: string; // JMAP blob ID after upload
  name: string;
  type: string;
  size: number;
  progress: number; // 0-100
  status: "uploading" | "complete" | "error";
  abortController?: AbortController;
  file?: File;
  /** For forwarded attachments: reference to original */
  isForwarded?: boolean;
  included?: boolean; // for forwarded attachments, default true
}

export type ComposeMode = "new" | "reply" | "reply-all" | "forward" | "draft";

export type WindowMode = "inline" | "popout" | "fullscreen" | "minimized";

export interface DraftState {
  draftId: string;
  emailId?: string; // JMAP Email ID after first server save
  composeMode: ComposeMode;
  windowMode: WindowMode;
  from: Identity | null;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  showCc: boolean;
  showBcc: boolean;
  subject: string;
  bodyHTML: string;
  bodyText: string;
  attachments: AttachmentState[];
  inReplyTo?: string;
  references?: string[];
  isDirty: boolean;
  lastSaved?: Date;
  saving: boolean;
  saveError?: string;
  /** Number of consecutive auto-save failures (only show error after 3) */
  consecutiveSaveFailures: number;
  /** Pre-resolved mailbox IDs so auto-save doesn't depend on hook state */
  draftsMailboxId?: string;
  sentMailboxId?: string;
}

interface ComposeState {
  /** All open drafts */
  drafts: Map<string, DraftState>;
  /** The currently focused/active draft */
  activeDraftId: string | null;

  // Actions
  openDraft: (draft: Partial<DraftState> & { draftId: string }) => void;
  closeDraft: (draftId: string) => void;
  updateDraft: (draftId: string, updates: Partial<DraftState>) => void;
  setActiveDraft: (draftId: string | null) => void;
  addAttachment: (draftId: string, attachment: AttachmentState) => void;
  removeAttachment: (draftId: string, attachmentId: string) => void;
  updateAttachment: (
    draftId: string,
    attachmentId: string,
    updates: Partial<AttachmentState>,
  ) => void;
  minimizeDraft: (draftId: string) => void;
  minimizeAllInlineDrafts: () => void;
  maximizeDraft: (draftId: string) => void;
  getDraft: (draftId: string) => DraftState | undefined;
}

function createDefaultDraft(overrides: Partial<DraftState> & { draftId: string }): DraftState {
  return {
    composeMode: "new",
    windowMode: "inline",
    from: null,
    to: [],
    cc: [],
    bcc: [],
    showCc: false,
    showBcc: false,
    subject: "",
    bodyHTML: "",
    bodyText: "",
    attachments: [],
    isDirty: false,
    saving: false,
    consecutiveSaveFailures: 0,
    ...overrides,
  };
}

export const useComposeStore = create<ComposeState>((set, get) => ({
  drafts: new Map(),
  activeDraftId: null,

  openDraft: (draft) => {
    set((state) => {
      const next = new Map(state.drafts);
      next.set(draft.draftId, createDefaultDraft(draft));
      return { drafts: next, activeDraftId: draft.draftId };
    });
  },

  closeDraft: (draftId) => {
    set((state) => {
      const next = new Map(state.drafts);
      next.delete(draftId);
      const activeDraftId =
        state.activeDraftId === draftId
          ? (next.keys().next().value ?? null)
          : state.activeDraftId;
      return { drafts: next, activeDraftId };
    });
  },

  updateDraft: (draftId, updates) => {
    set((state) => {
      const draft = state.drafts.get(draftId);
      if (!draft) return state;
      const next = new Map(state.drafts);
      next.set(draftId, { ...draft, ...updates, isDirty: true });
      return { drafts: next };
    });
  },

  setActiveDraft: (draftId) => {
    set({ activeDraftId: draftId });
  },

  addAttachment: (draftId, attachment) => {
    set((state) => {
      const draft = state.drafts.get(draftId);
      if (!draft) return state;
      const next = new Map(state.drafts);
      next.set(draftId, {
        ...draft,
        attachments: [...draft.attachments, attachment],
        isDirty: true,
      });
      return { drafts: next };
    });
  },

  removeAttachment: (draftId, attachmentId) => {
    set((state) => {
      const draft = state.drafts.get(draftId);
      if (!draft) return state;
      const att = draft.attachments.find((a) => a.id === attachmentId);
      if (att?.abortController) {
        att.abortController.abort();
      }
      const next = new Map(state.drafts);
      next.set(draftId, {
        ...draft,
        attachments: draft.attachments.filter((a) => a.id !== attachmentId),
        isDirty: true,
      });
      return { drafts: next };
    });
  },

  updateAttachment: (draftId, attachmentId, updates) => {
    set((state) => {
      const draft = state.drafts.get(draftId);
      if (!draft) return state;
      const next = new Map(state.drafts);
      next.set(draftId, {
        ...draft,
        attachments: draft.attachments.map((a) =>
          a.id === attachmentId ? { ...a, ...updates } : a,
        ),
      });
      return { drafts: next };
    });
  },

  minimizeDraft: (draftId) => {
    set((state) => {
      const draft = state.drafts.get(draftId);
      if (!draft) return state;
      const next = new Map(state.drafts);
      next.set(draftId, { ...draft, windowMode: "minimized" });
      // If this was active, clear active
      const activeDraftId =
        state.activeDraftId === draftId ? null : state.activeDraftId;
      return { drafts: next, activeDraftId };
    });
  },

  minimizeAllInlineDrafts: () => {
    set((state) => {
      let changed = false;
      const next = new Map(state.drafts);
      for (const [id, draft] of next) {
        if (draft.windowMode === "inline") {
          next.set(id, { ...draft, windowMode: "minimized" });
          changed = true;
        }
      }
      if (!changed) return state;
      // Clear active draft if it was inline
      const activeDraft = state.activeDraftId ? next.get(state.activeDraftId) : undefined;
      const activeDraftId =
        activeDraft?.windowMode === "minimized" ? null : state.activeDraftId;
      return { drafts: next, activeDraftId };
    });
  },

  maximizeDraft: (draftId) => {
    set((state) => {
      const draft = state.drafts.get(draftId);
      if (!draft) return state;
      const next = new Map(state.drafts);
      const previousMode = draft.windowMode === "minimized" ? "inline" : draft.windowMode;
      next.set(draftId, { ...draft, windowMode: previousMode });
      return { drafts: next, activeDraftId: draftId };
    });
  },

  getDraft: (draftId) => {
    return get().drafts.get(draftId);
  },
}));

/** Generate unique draft ID */
export function generateDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
