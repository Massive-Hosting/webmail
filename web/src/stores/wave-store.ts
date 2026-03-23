/** Wave call state store */

import { create } from "zustand";
import type { CallState, NetworkQuality } from "@/lib/wave.ts";

export interface ChatMessage {
  id: string;
  from: "me" | "peer";
  text: string;
  timestamp: number;
}

export interface Reaction {
  id: string;
  emoji: string;
  from: "me" | "peer";
  timestamp: number;
}

export interface CallHistoryEntry {
  id: string;
  peerEmail: string;
  peerName: string;
  duration: number; // seconds
  timestamp: number;
  video: boolean;
}

function loadCallHistory(): CallHistoryEntry[] {
  try {
    const raw = localStorage.getItem("wave_call_history");
    if (raw) return JSON.parse(raw) as CallHistoryEntry[];
  } catch { /* ignore */ }
  return [];
}

function saveCallHistory(history: CallHistoryEntry[]) {
  try {
    localStorage.setItem("wave_call_history", JSON.stringify(history));
  } catch { /* ignore */ }
}

export type VideoQuality = "low" | "medium" | "high" | "hd";

export const VIDEO_QUALITY_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  low:    { width: { ideal: 640 },  height: { ideal: 360 },  frameRate: { ideal: 15 } },
  medium: { width: { ideal: 960 },  height: { ideal: 540 },  frameRate: { ideal: 24 } },
  high:   { width: { ideal: 1280 }, height: { ideal: 720 },  frameRate: { ideal: 30 } },
  hd:     { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
};

function loadVideoQuality(): VideoQuality {
  try { return (localStorage.getItem("wave_video_quality") as VideoQuality) || "high"; } catch { return "high"; }
}

function loadNoiseSuppression(): boolean {
  try { return localStorage.getItem("wave_noise_suppression") === "true"; } catch { return false; }
}

interface WaveState {
  callState: CallState;
  callId: string | null;
  peerEmail: string | null;
  peerName: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  // Incoming call
  incomingCall: {
    callId: string;
    from: string;
    callerName: string;
    video: boolean;
  } | null;

  // Call duration
  callStartTime: number | null;

  // Network quality
  networkQuality: NetworkQuality;

  // Chat
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  unreadChat: number;

  // Reactions (transient — auto-removed after display)
  reactions: Reaction[];

  // Call history
  callHistory: CallHistoryEntry[];

  // Video quality
  videoQuality: VideoQuality;

  // Noise suppression
  noiseSuppression: boolean;

  // Actions
  setVideoQuality: (quality: VideoQuality) => void;
  setNoiseSuppression: (enabled: boolean) => void;
  setCallState: (state: CallState) => void;
  setCall: (callId: string, peerEmail: string, peerName: string) => void;
  setMuted: (muted: boolean) => void;
  setVideoOff: (off: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setIncomingCall: (call: WaveState["incomingCall"]) => void;
  setNetworkQuality: (quality: NetworkQuality) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  addReaction: (reaction: Reaction) => void;
  removeReaction: (id: string) => void;
  addCallHistory: (entry: CallHistoryEntry) => void;
  reset: () => void;
}

export const useWaveStore = create<WaveState>((set) => ({
  callState: "idle",
  callId: null,
  peerEmail: null,
  peerName: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  localStream: null,
  remoteStream: null,
  incomingCall: null,
  callStartTime: null,
  networkQuality: "unknown",
  chatMessages: [],
  chatOpen: false,
  unreadChat: 0,
  reactions: [],
  callHistory: loadCallHistory(),
  videoQuality: loadVideoQuality(),
  noiseSuppression: loadNoiseSuppression(),

  setVideoQuality: (quality) => {
    try { localStorage.setItem("wave_video_quality", quality); } catch { /* ignore */ }
    set({ videoQuality: quality });
  },
  setNoiseSuppression: (enabled) => {
    try { localStorage.setItem("wave_noise_suppression", String(enabled)); } catch { /* ignore */ }
    set({ noiseSuppression: enabled });
  },
  setCallState: (callState) =>
    set((s) => ({
      callState,
      callStartTime: callState === "connected" && !s.callStartTime ? Date.now() : s.callStartTime,
    })),
  setCall: (callId, peerEmail, peerName) => set({ callId, peerEmail, peerName }),
  setMuted: (isMuted) => set({ isMuted }),
  setVideoOff: (isVideoOff) => set({ isVideoOff }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setIncomingCall: (incomingCall) => set({ incomingCall }),
  setNetworkQuality: (networkQuality) => set({ networkQuality }),
  addChatMessage: (msg) =>
    set((s) => ({
      chatMessages: [...s.chatMessages, msg],
      unreadChat: s.chatOpen ? s.unreadChat : s.unreadChat + (msg.from === "peer" ? 1 : 0),
    })),
  setChatOpen: (chatOpen) => set({ chatOpen, unreadChat: chatOpen ? 0 : undefined as unknown as number }),
  addReaction: (reaction) => set((s) => ({ reactions: [...s.reactions, reaction] })),
  removeReaction: (id) => set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })),
  addCallHistory: (entry) =>
    set((s) => {
      const updated = [entry, ...s.callHistory].slice(0, 50);
      saveCallHistory(updated);
      return { callHistory: updated };
    }),
  reset: () =>
    set((s) => {
      // Save current call to history if it was connected
      if (s.callStartTime && s.peerEmail) {
        const duration = Math.round((Date.now() - s.callStartTime) / 1000);
        const entry: CallHistoryEntry = {
          id: crypto.randomUUID(),
          peerEmail: s.peerEmail,
          peerName: s.peerName ?? s.peerEmail,
          duration,
          timestamp: Date.now(),
          video: !s.isVideoOff,
        };
        const updated = [entry, ...s.callHistory].slice(0, 50);
        saveCallHistory(updated);
        return {
          callState: "idle",
          callId: null,
          peerEmail: null,
          peerName: null,
          isMuted: false,
          isVideoOff: false,
          isScreenSharing: false,
          localStream: null,
          remoteStream: null,
          incomingCall: null,
          callStartTime: null,
          networkQuality: "unknown",
          chatMessages: [],
          chatOpen: false,
          unreadChat: 0,
          reactions: [],
          callHistory: updated,
        };
      }
      return {
        callState: "idle",
        callId: null,
        peerEmail: null,
        peerName: null,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
        localStream: null,
        remoteStream: null,
        incomingCall: null,
        callStartTime: null,
        networkQuality: "unknown",
        chatMessages: [],
        chatOpen: false,
        unreadChat: 0,
        reactions: [],
      };
    }),
}));
