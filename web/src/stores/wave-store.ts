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

  // Actions
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
  reset: () =>
    set({
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
    }),
}));
