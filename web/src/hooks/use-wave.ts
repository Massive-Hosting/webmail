/** Wave call manager — connects WebSocket signaling to WebRTC */

import { useCallback, useEffect, useRef } from "react";
import { useWaveStore } from "@/stores/wave-store.ts";
import { WaveConnection } from "@/lib/wave.ts";
import { useAuthStore } from "@/stores/auth-store.ts";
import { apiGet } from "@/api/client.ts";
import type { WebSocketClient, WaveCallMessage } from "@/lib/websocket.ts";

let wsClient: WebSocketClient | null = null;
let waveConnection: WaveConnection | null = null;

/** Fetch TURN credentials from the server, fall back to STUN-only */
async function getICEServers(): Promise<RTCIceServer[] | undefined> {
  try {
    const result = await apiGet<{ iceServers: RTCIceServer[] }>("/api/turn/credentials");
    return result.iceServers;
  } catch {
    return undefined; // TURN not configured — STUN fallback
  }
}

/** Set the WebSocket client instance (called once from app-shell) */
export function setWaveWSClient(client: WebSocketClient) {
  wsClient = client;
}

export function useWave() {
  const store = useWaveStore();
  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to WebSocket call messages
  useEffect(() => {
    if (!wsClient || unsubRef.current) return;

    unsubRef.current = wsClient.onCallMessage((msg: WaveCallMessage) => {
      const state = useWaveStore.getState();

      switch (msg.type) {
        case "call-invite":
          if (state.callState !== "idle") break; // already in a call
          useWaveStore.getState().setIncomingCall({
            callId: msg.payload.callId,
            from: msg.from,
            callerName: msg.payload.callerName,
            video: msg.payload.video,
          });
          break;

        case "call-accept":
          if (state.callId === msg.payload.callId && waveConnection) {
            waveConnection.createOffer().catch(console.error);
          }
          break;

        case "call-reject":
          if (state.callId === msg.payload.callId) {
            cleanup();
          }
          break;

        case "call-end":
          if (state.callId === msg.payload.callId || state.peerEmail === msg.from) {
            cleanup();
          }
          break;

        case "call-signal":
          if (waveConnection && (state.callId === msg.payload.callId || state.peerEmail === msg.from)) {
            waveConnection.handleSignal(msg.payload.signal as { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }).catch(console.error);
          }
          break;

        // Chat message from peer
        case "call-chat":
          if (state.callId === msg.payload.callId) {
            useWaveStore.getState().addChatMessage({
              id: crypto.randomUUID(),
              from: "peer",
              text: msg.payload.text,
              timestamp: Date.now(),
            });
          }
          break;

        // Reaction from peer
        case "call-reaction":
          if (state.callId === msg.payload.callId) {
            const reactionId = crypto.randomUUID();
            useWaveStore.getState().addReaction({
              id: reactionId,
              emoji: msg.payload.emoji,
              from: "peer",
              timestamp: Date.now(),
            });
            // Auto-remove after animation
            setTimeout(() => useWaveStore.getState().removeReaction(reactionId), 3000);
          }
          break;
      }
    });

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  const cleanup = useCallback(() => {
    if (waveConnection) {
      waveConnection.hangup();
      waveConnection = null;
    }
    if (wsClient) wsClient.keepAlive = false;
    useWaveStore.getState().reset();
  }, []);

  const startCall = useCallback(
    async (peerEmail: string, video: boolean) => {
      if (!wsClient || store.callState !== "idle") return;

      const callId = crypto.randomUUID();
      const s = useWaveStore.getState();
      s.setCall(callId, peerEmail, peerEmail.split("@")[0]);
      s.setCallState("ringing");

      if (wsClient) wsClient.keepAlive = true;

      const iceServers = await getICEServers();

      waveConnection = new WaveConnection({
        callId,
        peerEmail,
        isInitiator: true,
        video,
        iceServers,
        onStateChange: (state) => useWaveStore.getState().setCallState(state),
        onRemoteStream: (stream) => useWaveStore.getState().setRemoteStream(stream),
        onLocalStream: (stream) => useWaveStore.getState().setLocalStream(stream),
        onNetworkQuality: (q) => useWaveStore.getState().setNetworkQuality(q),
        sendSignal: (to, signal) => {
          wsClient?.send({ type: "call-signal", to, payload: { callId, signal } });
        },
      });

      waveConnection.startLocalMedia(video).then(() => {
        wsClient?.send({
          type: "call-invite",
          to: peerEmail,
          payload: { callId, callerName: displayName || email, video },
        });
      }).catch(() => cleanup());
    },
    [store.callState, email, displayName, cleanup],
  );

  const acceptCall = useCallback(async () => {
    const incoming = useWaveStore.getState().incomingCall;
    if (!incoming || !wsClient) return;

    const s = useWaveStore.getState();
    s.setCall(incoming.callId, incoming.from, incoming.callerName);
    s.setCallState("connecting");
    s.setIncomingCall(null);

    if (wsClient) wsClient.keepAlive = true;

    const iceServers = await getICEServers();

    waveConnection = new WaveConnection({
      callId: incoming.callId,
      peerEmail: incoming.from,
      isInitiator: false,
      video: incoming.video,
      iceServers,
      onStateChange: (state) => useWaveStore.getState().setCallState(state),
      onRemoteStream: (stream) => useWaveStore.getState().setRemoteStream(stream),
      onLocalStream: (stream) => useWaveStore.getState().setLocalStream(stream),
      onNetworkQuality: (q) => useWaveStore.getState().setNetworkQuality(q),
      sendSignal: (to, signal) => {
        wsClient?.send({ type: "call-signal", to, payload: { callId: incoming.callId, signal } });
      },
    });

    waveConnection.startLocalMedia(incoming.video).then(() => {
      wsClient?.send({
        type: "call-accept",
        to: incoming.from,
        payload: { callId: incoming.callId },
      });
    }).catch(() => cleanup());
  }, [cleanup]);

  const rejectCall = useCallback(() => {
    const incoming = useWaveStore.getState().incomingCall;
    if (!incoming || !wsClient) return;

    wsClient.send({
      type: "call-reject",
      to: incoming.from,
      payload: { callId: incoming.callId },
    });
    useWaveStore.getState().setIncomingCall(null);
  }, []);

  const hangup = useCallback(() => {
    const s = useWaveStore.getState();
    if (s.peerEmail && s.callId && wsClient) {
      wsClient.send({
        type: "call-end",
        to: s.peerEmail,
        payload: { callId: s.callId },
      });
    }
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (waveConnection) {
      const muted = waveConnection.toggleMute();
      useWaveStore.getState().setMuted(muted);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (waveConnection) {
      const off = waveConnection.toggleVideo();
      useWaveStore.getState().setVideoOff(off);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!waveConnection) return;
    const s = useWaveStore.getState();
    if (s.isScreenSharing) {
      waveConnection.stopScreenShare();
      s.setScreenSharing(false);
    } else {
      const screenStream = await waveConnection.startScreenShare();
      if (screenStream) {
        s.setScreenSharing(true);
        // Show screen share in local PiP so sharer can see what they're sharing
        s.setLocalStream(screenStream);
      }
    }
  }, []);

  const sendChat = useCallback((text: string) => {
    const s = useWaveStore.getState();
    if (!wsClient || !s.peerEmail || !s.callId) return;
    wsClient.send({
      type: "call-chat",
      to: s.peerEmail,
      payload: { callId: s.callId, text },
    });
    s.addChatMessage({
      id: crypto.randomUUID(),
      from: "me",
      text,
      timestamp: Date.now(),
    });
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const s = useWaveStore.getState();
    if (!wsClient || !s.peerEmail || !s.callId) return;
    wsClient.send({
      type: "call-reaction",
      to: s.peerEmail,
      payload: { callId: s.callId, emoji },
    });
    const reactionId = crypto.randomUUID();
    s.addReaction({
      id: reactionId,
      emoji,
      from: "me",
      timestamp: Date.now(),
    });
    setTimeout(() => useWaveStore.getState().removeReaction(reactionId), 3000);
  }, []);

  /** Switch audio input device mid-call */
  const switchAudioDevice = useCallback(async (deviceId: string) => {
    if (waveConnection) {
      try {
        await waveConnection.switchAudioDevice(deviceId);
      } catch (e) {
        console.error("[Wave] Failed to switch audio device:", e);
      }
    }
  }, []);

  /** Switch video input device mid-call */
  const switchVideoDevice = useCallback(async (deviceId: string) => {
    if (waveConnection) {
      try {
        await waveConnection.switchVideoDevice(deviceId);
      } catch (e) {
        console.error("[Wave] Failed to switch video device:", e);
      }
    }
  }, []);

  /** Replace the local video track on the peer connection (for background effects) */
  const replaceLocalVideoTrack = useCallback(async (track: MediaStreamTrack) => {
    if (waveConnection) {
      await waveConnection.replaceLocalVideoTrack(track);
    }
  }, []);

  /** Enable browser Picture-in-Picture on the remote video element */
  const enablePiP = useCallback(async (videoElement: HTMLVideoElement | null) => {
    if (!videoElement || !document.pictureInPictureEnabled) return;
    try {
      await videoElement.requestPictureInPicture();
    } catch {
      // PiP not available or user denied
    }
  }, []);

  return {
    ...store,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    sendChat,
    sendReaction,
    enablePiP,
    switchAudioDevice,
    switchVideoDevice,
    replaceLocalVideoTrack,
  };
}
