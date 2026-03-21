/** Wave call state store */

import { create } from "zustand";
import type { CallState } from "@/lib/wave.ts";

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

  // Actions
  setCallState: (state: CallState) => void;
  setCall: (callId: string, peerEmail: string, peerName: string) => void;
  setMuted: (muted: boolean) => void;
  setVideoOff: (off: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setIncomingCall: (call: WaveState["incomingCall"]) => void;
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
    }),
}));
