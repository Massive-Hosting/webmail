/** Wave Guest Join — dangerously sexy public lobby for external call recipients */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2,
  Settings2, Loader2, Monitor, Maximize, Minimize2, MessageCircle, Send, X, Smile,
} from "lucide-react";
import { DarkSelect } from "./dark-select.tsx";
import { useDraggable, useResizable } from "@/hooks/use-draggable.ts";
import { playConnectSound, playDisconnectSound, unlockAudio } from "@/lib/wave-sounds.ts";
import { getVideoConstraints } from "@/lib/wave.ts";

interface RoomInfo {
  id: string;
  host_name: string;
  video: boolean;
  expires_at: string;
}

interface GuestJoinProps {
  roomId: string;
}

type RoomState = "loading" | "ready" | "connecting" | "connected" | "ended" | "error";

export const WaveGuestJoin = React.memo(function WaveGuestJoin({ roomId }: GuestJoinProps) {
  const [roomState, setRoomState] = useState<RoomState>("loading");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState("");
  const [guestName, setGuestName] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showCallDevices, setShowCallDevices] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; from: "me" | "peer"; text: string; timestamp: number }>>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatText, setChatText] = useState("");
  const [showReactions, setShowReactions] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string }>>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const savedCamTrackRef = useRef<MediaStreamTrack | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const { handleProps: pipDragProps, containerStyle: pipDragStyle } = useDraggable({ x: typeof window !== "undefined" ? window.innerWidth - 260 : 600, y: typeof window !== "undefined" ? window.innerHeight - 220 : 400 });
  const { size: pipSize, resizeHandleProps: pipResizeProps } = useResizable({ width: 240, height: 180 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const callStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Fetch room info
  useEffect(() => {
    fetch(`/api/call-rooms/${roomId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Room not found or expired");
        return r.json();
      })
      .then((data: RoomInfo) => {
        setRoom(data);
        setVideoEnabled(data.video);
        setRoomState("ready");
      })
      .catch((err) => {
        setError(err.message);
        setRoomState("error");
      });
  }, [roomId]);

  // Start media preview once room is loaded
  useEffect(() => {
    if (roomState !== "ready") return;
    startPreview();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [roomState]);

  // Audio/video toggle — track.enabled
  useEffect(() => {
    if (!stream) return;
    for (const t of stream.getAudioTracks()) t.enabled = audioEnabled;
  }, [audioEnabled, stream]);

  useEffect(() => {
    if (!stream) return;
    for (const t of stream.getVideoTracks()) t.enabled = videoEnabled;
  }, [videoEnabled, stream]);

  // Play connect/disconnect sounds
  useEffect(() => {
    if (roomState === "connected") playConnectSound();
    if (roomState === "ended") playDisconnectSound();
  }, [roomState]);

  // Call duration timer
  useEffect(() => {
    if (roomState === "connected") {
      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [roomState]);

  const startPreview = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { ...getVideoConstraints(), facingMode: "user" },
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;

      // Audio level meter
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / dataArray.length) * 4));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
      setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
      setSpeakerDevices(devices.filter((d) => d.kind === "audiooutput"));
    } catch {
      // Fallback — audio only
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(audioOnly);
        setVideoEnabled(false);
      } catch {
        setError("Camera and microphone access denied");
      }
    }
  }, []);

  const joinCall = useCallback(async () => {
    let mediaStream = stream;
    if (!mediaStream) {
      // Try to get at least audio if preview failed
      console.warn("[Wave] No preview stream, attempting audio-only...");
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(mediaStream);
        setVideoEnabled(false);
      } catch (e) {
        console.error("[Wave] Cannot get any media:", e);
        return;
      }
    }
    unlockAudio();
    setRoomState("connecting");

    // Fetch TURN credentials
    let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    try {
      const turnRes = await fetch(`/api/call-rooms/${roomId}/turn`);
      if (turnRes.ok) {
        const turnData = await turnRes.json();
        iceServers = turnData.iceServers;
      }
    } catch { /* STUN fallback */ }

    // Create WebRTC peer connection
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    for (const track of mediaStream.getTracks()) {
      pc.addTrack(track, mediaStream);
    }

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setRoomState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") setRoomState("ended");
    };

    // Connect guest WebSocket
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/call-rooms/${roomId}/ws`);
    wsRef.current = ws;

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "call-signal",
          to: "__host__",
          payload: JSON.stringify({ callId: roomId, signal: { type: "ice-candidate", candidate: e.candidate } }),
        }));
      }
    };

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (msg.type === "call-signal") {
          const payload = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
          const signal = payload.signal;
          if (signal?.type === "sdp" && signal.sdp) {
            if (signal.sdp.type === "offer") {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify({
                type: "call-signal",
                to: msg.from,
                payload: JSON.stringify({ callId: roomId, signal: { type: "sdp", sdp: pc.localDescription } }),
              }));
            } else if (signal.sdp.type === "answer") {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            }
          } else if (signal?.type === "ice-candidate" && signal.candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch { /* ignore */ }
          }
        }
        if (msg.type === "call-end") {
          setRoomState("ended");
        }

        if (msg.type === "call-chat") {
          const chatPayload = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
          setChatMessages(prev => [...prev, {
            id: `${Date.now()}-${Math.random()}`,
            from: "peer",
            text: chatPayload.text,
            timestamp: Date.now(),
          }]);
          if (!chatOpen) setUnreadChat(prev => prev + 1);
        }

        if (msg.type === "call-reaction") {
          const reactionPayload = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
          const id = `${Date.now()}-${Math.random()}`;
          setFloatingReactions(prev => [...prev, { id, emoji: reactionPayload.emoji }]);
          setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3000);
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onopen = () => {
      // Announce presence to host
      ws.send(JSON.stringify({
        type: "call-accept",
        to: "__host__",
        payload: JSON.stringify({ callId: roomId, guestName: guestName || "Guest" }),
      }));
    };

    ws.onclose = () => {
      if (roomState !== "ended") setRoomState("ended");
    };
  }, [stream, roomId, guestName, roomState]);

  // Keep local video element synced with stream (re-attaches after state transitions)
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, roomState]);

  // Attach remote stream to video element when it becomes available
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Apply speaker (audio output) selection to remote video element
  useEffect(() => {
    if (remoteVideoRef.current && selectedSpeaker && 'setSinkId' in remoteVideoRef.current) {
      (remoteVideoRef.current as any).setSinkId(selectedSpeaker).catch(() => {});
    }
  }, [selectedSpeaker, remoteStream]);

  const sendChatMessage = useCallback(() => {
    if (!chatText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const text = chatText.trim();
    wsRef.current.send(JSON.stringify({
      type: "call-chat",
      to: "__all__",
      payload: JSON.stringify({ text }),
    }));
    setChatMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      from: "me",
      text,
      timestamp: Date.now(),
    }]);
    setChatText("");
    chatInputRef.current?.focus();
  }, [chatText]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages.length]);

  const hangup = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call-end", to: "__host__", payload: JSON.stringify({ callId: roomId }) }));
    }
    pcRef.current?.close();
    wsRef.current?.close();
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setRoomState("ended");
  }, [stream, roomId]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Render ──

  if (roomState === "loading") {
    return <FullScreenBg><Loader2 className="w-8 h-8 text-white/50 animate-spin" /></FullScreenBg>;
  }

  if (roomState === "error") {
    return (
      <FullScreenBg>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <PhoneOff className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Call Unavailable</h1>
          <p className="text-white/50 text-sm">{error || "This call link has expired or is invalid."}</p>
        </div>
      </FullScreenBg>
    );
  }

  if (roomState === "ended") {
    return (
      <FullScreenBg>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <Phone className="w-8 h-8 text-white/40" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Call Ended</h1>
          {callDuration > 0 && <p className="text-white/40 text-sm">Duration: {formatTime(callDuration)}</p>}
        </div>
      </FullScreenBg>
    );
  }

  // Connected — full screen call view
  if (roomState === "connected" || roomState === "connecting") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
        {/* Remote video — with fallback for audio-only peers */}
        <div className="flex-1 relative min-h-0">
          {remoteStream && <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain bg-black" />}
          {(!remoteStream || (remoteStream && remoteStream.getVideoTracks().length === 0)) && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #1a1040 0%, #0c0a09 60%, #000 100%)" }}>
              <div className="text-center">
                {roomState === "connecting" ? (
                  <>
                    <div className="relative w-24 h-24 mx-auto mb-4">
                      <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(99,102,241,0.3)", animation: "wave-ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />
                      <div className="absolute inset-2 rounded-full" style={{ border: "1.5px solid rgba(99,102,241,0.2)", animation: "wave-ping 2s cubic-bezier(0,0,0.2,1) infinite 0.5s" }} />

                      <div className="absolute inset-4 rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)" }}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}>
                          <Phone size={16} className="text-white/80" />
                        </div>
                      </div>
                    </div>
                    <p className="wave-text-secondary text-sm">Connecting to {room?.host_name}...</p>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center wave-surface-border" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))", borderWidth: "1px", borderStyle: "solid" }}>
                      <span className="text-3xl font-bold wave-text-secondary">{(room?.host_name || "H")[0].toUpperCase()}</span>
                    </div>
                    <p className="text-white/70 text-sm font-medium">{room?.host_name}</p>
                    <p className="text-white/30 text-xs mt-1"><VideoOff size={12} className="inline mr-1" />Camera off</p>
                  </>
                )}
              </div>
            </div>
          )}
          {/* Local PiP — draggable + resizable */}
          <div
            data-draggable
            className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl bg-[#292524]"
            style={{
              width: pipSize.width,
              height: pipSize.height,
              ...pipDragStyle,
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing" {...pipDragProps} />
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            {!videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#292524]">
                <VideoOff size={18} className="wave-text-tertiary" />
              </div>
            )}
            {/* Resize handle */}
            <div {...pipResizeProps}>
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.4 }}>
                <path d="M14 2L2 14M14 6L6 14M14 10L10 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          {/* Top bar — duration + participant name */}
          {roomState === "connected" && (
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/80 text-xs font-medium">{room?.host_name}</span>
              </div>
              <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                <span className="text-white/80 text-xs font-mono">{formatTime(callDuration)}</span>
              </div>
            </div>
          )}
        </div>
        {/* Controls */}
        <div className="relative flex items-center justify-center gap-3 py-5" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.4))" }}>
          {showCallDevices && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 p-4 rounded-xl w-80 space-y-3 animate-scale-in wave-surface-border"
              style={{ backgroundColor: "rgba(28,25,23,0.95)", borderWidth: "1px", borderStyle: "solid", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}>
              {audioDevices.length > 0 && (
                <DarkSelect label="Microphone" value={selectedAudioDevice || audioDevices[0]?.deviceId || ""} options={audioDevices.map(d => ({ value: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0,4)}` }))} onChange={setSelectedAudioDevice} />
              )}
              {videoDevices.length > 0 && (
                <DarkSelect label="Camera" value={selectedVideoDevice || videoDevices[0]?.deviceId || ""} options={videoDevices.map(d => ({ value: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0,4)}` }))} onChange={setSelectedVideoDevice} />
              )}
              {speakerDevices.length > 0 && (
                <DarkSelect label="Speaker" value={selectedSpeaker || speakerDevices[0]?.deviceId || ""} options={speakerDevices.map(d => ({ value: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0,4)}` }))} onChange={setSelectedSpeaker} />
              )}
            </div>
          )}
          <ControlButton active={audioEnabled} onClick={() => setAudioEnabled(!audioEnabled)} icon={audioEnabled ? <Mic size={20} /> : <MicOff size={20} />} />
          <ControlButton active={videoEnabled} onClick={() => setVideoEnabled(!videoEnabled)} icon={videoEnabled ? <Video size={20} /> : <VideoOff size={20} />} />
          <div className="relative">
            <ControlButton active={chatOpen} onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnreadChat(0); }} icon={<MessageCircle size={20} />} />
            {unreadChat > 0 && !chatOpen && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadChat > 9 ? "9+" : unreadChat}
              </div>
            )}
          </div>
          <div className="relative">
            <ControlButton active={showReactions} onClick={() => setShowReactions(!showReactions)} icon={<Smile size={20} />} />
            {showReactions && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-1.5 rounded-xl animate-scale-in"
                style={{ backgroundColor: "#1c1917", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>

                {["👍", "👏", "😂", "❤️", "🎉", "🤔", "👋", "🔥"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      wsRef.current?.send(JSON.stringify({ type: "call-reaction", to: "__all__", payload: JSON.stringify({ emoji }) }));
                      setShowReactions(false);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 active:scale-90 hover:bg-white/10"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ControlButton
            active={isScreenSharing}
            onClick={async () => {
              const pc = pcRef.current;
              if (!pc) return;
              if (isScreenSharing) {
                // Stop screen sharing — revert to camera
                screenTrackRef.current?.stop();
                screenTrackRef.current = null;
                const cam = savedCamTrackRef.current;
                const sender = pc.getSenders().find((s) => s.track?.kind === "video" || !s.track);
                if (sender && cam) await sender.replaceTrack(cam);
                setIsScreenSharing(false);
                return;
              }
              try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];
                if (!screenTrack || screenTrack.readyState === "ended") return;
                savedCamTrackRef.current = stream?.getVideoTracks()[0] ?? null;
                // Find video sender — try exact match first, then any sender with a track, then any sender
                const senders = pc.getSenders();
                const sender = senders.find((s) => s.track?.kind === "video")
                  ?? senders.find((s) => s.track != null)
                  ?? senders[0];
                if (sender) {
                  await sender.replaceTrack(screenTrack);
                } else {
                  try {
                    pc.addTrack(screenTrack, screenStream);
                  } catch (addErr) {
                    console.warn("[Wave] addTrack failed, screen share not supported in this state:", addErr);
                    screenTrack.stop();
                    return;
                  }
                }
                // Show screen share in local PiP
                if (videoRef.current) videoRef.current.srcObject = screenStream;
                screenTrackRef.current = screenTrack;
                setIsScreenSharing(true);
                screenTrack.addEventListener("ended", () => {
                  const cam = savedCamTrackRef.current;
                  const s = pc.getSenders().find((s) => s.track?.kind === "video" || !s.track) ?? pc.getSenders()[0];
                  if (s && cam) s.replaceTrack(cam);
                  // Restore camera in local PiP
                  if (videoRef.current && stream) videoRef.current.srcObject = stream;
                  setIsScreenSharing(false);
                  screenTrackRef.current = null;
                });
              } catch (e) {
                console.error("[Wave] Screen share failed:", e);
              }
            }}
            icon={<Monitor size={20} />}
          />
          <ControlButton
            active={showCallDevices}
            onClick={() => setShowCallDevices(!showCallDevices)}
            icon={<Settings2 size={20} />}
          />
          <button onClick={hangup} className="flex items-center justify-center w-14 h-14 rounded-full transition-transform hover:scale-105 active:scale-95" style={{ background: "linear-gradient(135deg, var(--color-danger), #dc2626)" }}>
            <PhoneOff size={22} className="text-white" />
          </button>
        </div>
        {/* Floating reactions */}
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
          {floatingReactions.map((r) => (
            <div key={r.id} className="absolute text-4xl" style={{ left: `${Math.random() * 200 - 100}px`, animation: "reaction-float 3s ease-out forwards" }}>
              {r.emoji}
            </div>
          ))}
        </div>
        {/* Chat panel */}
        {chatOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-80 flex flex-col z-[9999]"
            style={{ backgroundColor: "rgba(28,25,23,0.95)", borderLeft: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 wave-surface-border" style={{ borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
              <span className="wave-text text-sm font-medium">Chat</span>
              <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-white/10 wave-text-tertiary">
                <X size={14} />
              </button>
            </div>
            {/* Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-white/20 text-xs">No messages yet</div>
              )}
              {chatMessages.map((msg) => {
                const isMe = msg.from === "me";
                const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[85%] px-3 py-1.5 rounded-xl text-xs"
                      style={{
                        backgroundColor: isMe ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
                        color: isMe ? "#93c5fd" : "rgba(255,255,255,0.8)",
                        borderBottomRightRadius: isMe ? 4 : undefined,
                        borderBottomLeftRadius: !isMe ? 4 : undefined,
                      }}>
                      <p className="break-words whitespace-pre-wrap">{msg.text}</p>
                      <span className="block text-[10px] mt-0.5 wave-text-tertiary">{time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Input */}
            <div className="px-3 pb-3 pt-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg wave-surface-elevated" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent text-xs outline-none wave-text"
                />
                <button onClick={sendChatMessage} disabled={!chatText.trim()} className="p-1 rounded transition-colors hover:bg-white/10 disabled:opacity-30 wave-text-secondary">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
        <style>{`
          @keyframes wave-ping {
            0% { transform: scale(1); opacity: 1; }
            75%, 100% { transform: scale(1.5); opacity: 0; }
          }
          @keyframes reaction-float {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-150px) scale(1.5); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // Lobby — the sexy part
  return (
    <FullScreenBg>
      <div className="w-full max-w-lg mx-auto px-4">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border wave-surface-border backdrop-blur-sm mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="wave-text-secondary text-xs font-medium tracking-wide uppercase">Wave Call</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {room?.host_name} is calling
          </h1>
          <p className="wave-text-tertiary text-sm">Set up your camera and mic, then join the call</p>
        </div>

        {/* Video preview card */}
        <div className="rounded-2xl overflow-hidden mb-6 relative wave-surface-border" style={{ aspectRatio: "16/10", backgroundColor: "#0a0a0a", borderWidth: "1px", borderStyle: "solid" }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover absolute inset-0"
            style={{ transform: "scaleX(-1)", opacity: videoEnabled ? 1 : 0, transition: "opacity 150ms" }}
          />
          {!videoEnabled && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 relative z-10">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border wave-surface-border">
                <span className="text-2xl font-bold text-white/70">{(guestName || "G")[0].toUpperCase()}</span>
              </div>
              <span className="text-white/30 text-xs">Camera off</span>
            </div>
          )}
          {/* Audio level meter */}
          {audioEnabled && stream && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <Volume2 size={14} className="wave-text-tertiary" />
              <div className="flex items-end gap-0.5 h-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full transition-all duration-75"
                    style={{
                      height: Math.max(3, audioLevel > i / 12 ? audioLevel * 16 : 3),
                      backgroundColor: audioLevel > i / 12 ? (i < 8 ? "var(--color-success)" : i < 10 ? "#f59e0b" : "var(--color-danger)") : "rgba(255,255,255,0.1)",
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Name input */}
        <div className="mb-5">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 rounded-xl text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 wave-surface-elevated wave-text wave-surface-border"
            style={{
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <LobbyBtn
            icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            label={audioEnabled ? "Mute" : "Unmute"}
            active={audioEnabled}
            danger={!audioEnabled}
            onClick={() => setAudioEnabled(!audioEnabled)}
          />
          <LobbyBtn
            icon={videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            label={videoEnabled ? "Camera off" : "Camera on"}
            active={videoEnabled}
            danger={!videoEnabled}
            onClick={() => setVideoEnabled(!videoEnabled)}
          />
        </div>

        {/* Device settings — always visible */}
        {stream && (audioDevices.length > 0 || videoDevices.length > 0) && (
          <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <Settings2 size={13} className="wave-text-tertiary" />
              <label className="text-[11px] font-medium wave-text-tertiary">Device settings</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {audioDevices.length > 0 && (
                <DarkSelect
                  label="Microphone"
                  value={selectedAudioDevice || audioDevices[0]?.deviceId || ""}
                  options={audioDevices.map((d) => ({ value: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 4)}` }))}
                  onChange={setSelectedAudioDevice}
                />
              )}
              {videoDevices.length > 0 && (
                <DarkSelect
                  label="Camera"
                  value={selectedVideoDevice || videoDevices[0]?.deviceId || ""}
                  options={videoDevices.map((d) => ({ value: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }))}
                  onChange={setSelectedVideoDevice}
                />
              )}
              {speakerDevices.length > 0 && (
                <DarkSelect
                  label="Speaker"
                  value={selectedSpeaker || speakerDevices[0]?.deviceId || ""}
                  options={speakerDevices.map((d) => ({ value: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 4)}` }))}
                  onChange={setSelectedSpeaker}
                />
              )}
            </div>
          </div>
        )}

        {/* Join button */}
        <button
          onClick={joinCall}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, var(--color-success), #16a34a)",
            color: "white",
            boxShadow: "0 8px 32px rgba(34, 197, 94, 0.3), 0 0 0 1px rgba(34, 197, 94, 0.1)",
            letterSpacing: "0.02em",
          }}
        >
          <Phone size={20} />
          Join Call
        </button>

        {/* Footer */}
        <p className="text-center text-white/20 text-[11px] mt-6">
          Powered by Wave — peer-to-peer encrypted video calling
        </p>
      </div>
    </FullScreenBg>
  );
});

/** Full-screen dark gradient background */
function FullScreenBg({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-auto"
      style={{
        background: "radial-gradient(ellipse at 30% 20%, #1a1040 0%, #0c0a09 50%, #000000 100%)",
      }}
    >
      {/* Subtle animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-96 h-96 rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(circle, #6366f1, transparent 70%)",
            top: "10%",
            left: "20%",
            animation: "float 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-80 h-80 rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, var(--color-success), transparent 70%)",
            bottom: "10%",
            right: "15%",
            animation: "float 25s ease-in-out infinite reverse",
          }}
        />
      </div>
      <div className="relative z-10">{children}</div>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
      `}</style>
    </div>
  );
}

/** Lobby toggle button */
function LobbyBtn({ icon, label, active, danger, accent, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; danger?: boolean; accent?: boolean; onClick: () => void;
}) {
  const bg = danger ? "rgba(239,68,68,0.15)" : accent ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.06)";
  const border = danger ? "rgba(239,68,68,0.25)" : accent ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)";
  const color = danger ? "var(--color-danger)" : accent ? "#818cf8" : "rgba(255,255,255,0.75)";
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
      style={{ backgroundColor: bg, color, border: `1px solid ${border}`, backdropFilter: "blur(8px)" }}
    >
      {icon}{label}
    </button>
  );
}

/** In-call control button */
function ControlButton({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-150 hover:scale-105 active:scale-95"
      style={{
        backgroundColor: active ? "rgba(255,255,255,0.1)" : "rgba(239,68,68,0.2)",
        border: `1px solid ${active ? "rgba(255,255,255,0.15)" : "rgba(239,68,68,0.3)"}`,
        color: active ? "white" : "var(--color-danger)",
      }}
    >
      {icon}
    </button>
  );
}
