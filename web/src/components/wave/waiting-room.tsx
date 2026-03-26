/** Wave Waiting Room — host waits here after sending invite to external guest */

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Copy, Check, Loader2, X,
  Monitor, Volume2, Settings2, MessageCircle, Send, Smile,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDraggable, useResizable } from "@/hooks/use-draggable.ts";
import { DarkSelect } from "./dark-select.tsx";
import { playConnectSound, playDisconnectSound, unlockAudio } from "@/lib/wave-sounds.ts";
import { getVideoConstraints } from "@/lib/wave.ts";

interface WaitingRoomProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  joinUrl: string;
  guestName: string;
  guestEmail: string;
  video: boolean;
}

export const WaveWaitingRoom = React.memo(function WaveWaitingRoom({
  open,
  onOpenChange,
  roomId,
  joinUrl,
  guestName,
  guestEmail,
  video: initialVideo,
}: WaitingRoomProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"waiting" | "connecting" | "connected" | "ended">("waiting");
  const [videoEnabled, setVideoEnabled] = useState(initialVideo);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [copied, setCopied] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
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
  const { handleProps: pipDragProps, containerStyle: pipDragStyle } = useDraggable({ x: typeof window !== "undefined" ? window.innerWidth - 260 : 600, y: typeof window !== "undefined" ? window.innerHeight - 220 : 400 });
  const { size: pipSize, resizeHandleProps: pipResizeProps } = useResizable({ width: 240, height: 180 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const callStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Start local media preview
  useEffect(() => {
    if (!open) return;
    unlockAudio();
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { ...getVideoConstraints(), facingMode: "user" } });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;

        // Audio level meter
        const ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(s);
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
        setAudioDevices(devices.filter(d => d.kind === "audioinput"));
        setVideoDevices(devices.filter(d => d.kind === "videoinput"));
        setSpeakerDevices(devices.filter(d => d.kind === "audiooutput"));
      } catch {
        // Audio only fallback
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          setStream(s);
          setVideoEnabled(false);
        } catch { /* ignore */ }
      }
    })();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [open]);

  // Keep a ref to the current stream so the WS handler can access it
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { streamRef.current = stream; }, [stream]);

  // Connect to room WebSocket immediately (don't wait for stream)
  useEffect(() => {
    if (!open) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/call-rooms/${roomId}/ws`);
    wsRef.current = ws;

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        // Guest accepted — start WebRTC
        if (msg.type === "call-accept") {
          setStatus("connecting");

          // Wait for media stream if not ready yet
          let mediaStream = streamRef.current;
          if (!mediaStream) {
            console.log("[Wave] Waiting for media stream...");
            for (let i = 0; i < 50; i++) {
              await new Promise((r) => setTimeout(r, 200));
              mediaStream = streamRef.current;
              if (mediaStream) break;
            }
          }
          if (!mediaStream) {
            console.error("[Wave] No media stream available after waiting");
            setStatus("ended");
            return;
          }

          // Fetch TURN credentials
          let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
          try {
            const r = await fetch("/api/turn/credentials");
            if (r.ok) {
              const d = await r.json();
              iceServers = d.iceServers;
            }
          } catch { /* STUN fallback */ }

          const pc = new RTCPeerConnection({ iceServers });
          pcRef.current = pc;

          for (const track of mediaStream.getTracks()) {
            pc.addTrack(track, mediaStream);
          }

          pc.ontrack = (ev) => {
            if (ev.streams[0]) {
              setRemoteStream(ev.streams[0]);
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = ev.streams[0];
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") setStatus("connected");
            if (pc.connectionState === "failed" || pc.connectionState === "closed") setStatus("ended");
          };

          pc.onicecandidate = (ev) => {
            if (ev.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "call-signal",
                to: msg.from,
                payload: JSON.stringify({ callId: roomId, signal: { type: "ice-candidate", candidate: ev.candidate } }),
              }));
            }
          };

          // Create offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({
            type: "call-signal",
            to: msg.from,
            payload: JSON.stringify({ callId: roomId, signal: { type: "sdp", sdp: pc.localDescription } }),
          }));
        }

        // Handle signaling from guest
        if (msg.type === "call-signal") {
          const payload = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
          const signal = payload.signal;
          const pc = pcRef.current;
          if (!pc) return;

          if (signal?.type === "sdp" && signal.sdp) {
            if (signal.sdp.type === "answer") {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            }
          } else if (signal?.type === "ice-candidate" && signal.candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch { /* ignore */ }
          }
        }

        if (msg.type === "call-end") {
          setStatus("ended");
        }

        if (msg.type === "call-chat") {
          const payload = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
          setChatMessages(prev => [...prev, {
            id: `${Date.now()}-${Math.random()}`,
            from: "peer",
            text: payload.text,
            timestamp: Date.now(),
          }]);
          if (!chatOpen) setUnreadChat(prev => prev + 1);
        }

        if (msg.type === "call-reaction") {
          const payload = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
          const id = `${Date.now()}-${Math.random()}`;
          setFloatingReactions(prev => [...prev, { id, emoji: payload.emoji }]);
          setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 3000);
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      if (status !== "ended") setStatus("ended");
    };

    return () => {
      ws.close();
    };
  }, [open, roomId]);

  // Toggle tracks
  useEffect(() => {
    if (!stream) return;
    for (const t of stream.getAudioTracks()) t.enabled = audioEnabled;
  }, [audioEnabled, stream]);

  useEffect(() => {
    if (!stream) return;
    for (const t of stream.getVideoTracks()) t.enabled = videoEnabled;
  }, [videoEnabled, stream]);

  // Switch audio device
  useEffect(() => {
    if (!stream || !selectedAudioDevice) return;
    const current = stream.getAudioTracks()[0];
    if (current?.getSettings().deviceId === selectedAudioDevice) return;
    (async () => {
      try {
        const newAudio = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedAudioDevice } } });
        const newTrack = newAudio.getAudioTracks()[0];
        if (current) stream.removeTrack(current);
        current?.stop();
        if (newTrack) {
          newTrack.enabled = audioEnabled;
          stream.addTrack(newTrack);
          // Replace on peer connection if active
          const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) await sender.replaceTrack(newTrack);
        }
      } catch (e) { console.error("[Wave] Failed to switch audio:", e); }
    })();
  }, [selectedAudioDevice]);

  // Switch video device
  useEffect(() => {
    if (!stream || !selectedVideoDevice) return;
    const current = stream.getVideoTracks()[0];
    if (current?.getSettings().deviceId === selectedVideoDevice) return;
    (async () => {
      try {
        const newVideo = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: selectedVideoDevice } } });
        const newTrack = newVideo.getVideoTracks()[0];
        if (current) stream.removeTrack(current);
        current?.stop();
        if (newTrack) {
          newTrack.enabled = videoEnabled;
          stream.addTrack(newTrack);
          // Replace on peer connection if active
          const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(newTrack);
        }
        // Force video element to re-render with new track
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) { console.error("[Wave] Failed to switch video:", e); }
    })();
  }, [selectedVideoDevice]);

  // Keep local video element synced with stream (re-attaches after state transitions)
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, status]);

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

  // Play connect/disconnect sounds
  useEffect(() => {
    if (status === "connected") playConnectSound();
    if (status === "ended") playDisconnectSound();
  }, [status]);

  // Call duration timer
  useEffect(() => {
    if (status === "connected") {
      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [joinUrl]);

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

  const handleHangup = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call-end", to: "__all__", payload: JSON.stringify({ callId: roomId }) }));
    }
    pcRef.current?.close();
    wsRef.current?.close();
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("ended");
    onOpenChange(false);
  }, [stream, roomId, onOpenChange]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (!open) return null;

  // ── Connected / Connecting — full call view ──
  if (status === "connected" || status === "connecting") {
    return (
      <div className="fixed inset-0 z-[9998] bg-black flex flex-col overflow-hidden">
        <div className="flex-1 relative min-h-0">
          {/* Remote video — with fallback for audio-only peers */}
          {remoteStream && <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" style={{ backgroundColor: "#000" }} />}
          {(!remoteStream || (remoteStream && remoteStream.getVideoTracks().length === 0)) && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #1a1040 0%, #0c0a09 60%, #000 100%)" }}>
              <div className="text-center">
                {status === "connecting" ? (
                  <div className="relative w-24 h-24 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(99,102,241,0.3)", animation: "wave-ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />
                    <div className="absolute inset-2 rounded-full" style={{ border: "1.5px solid rgba(99,102,241,0.2)", animation: "wave-ping 2s cubic-bezier(0,0,0.2,1) infinite 0.5s" }} />
                    <div className="absolute inset-4 rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)" }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))", boxShadow: "0 0 20px rgba(99,102,241,0.3)" }}>
                        <Phone size={16} className="text-white/80" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <span className="text-3xl font-bold text-white/60">{(guestName || "G")[0].toUpperCase()}</span>
                    </div>
                    <p className="text-white/70 text-sm font-medium">{guestName || guestEmail}</p>
                    <p className="text-white/30 text-xs mt-1"><VideoOff size={12} className="inline mr-1" />Camera off</p>
                  </>
                )}
                {status === "connecting" && <p className="text-white/50 text-sm">Connecting to {guestName}...</p>}
              </div>
            </div>
          )}
          {/* Top bar */}
          {status === "connected" && (
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/80 text-xs font-medium">{guestName || guestEmail}</span>
              </div>
              <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                <span className="text-white/80 text-xs font-mono">{formatTime(callDuration)}</span>
              </div>
            </div>
          )}
          {/* Local PiP — draggable + resizable */}
          <div
            data-draggable
            className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl"
            style={{
              width: pipSize.width,
              height: pipSize.height,
              ...pipDragStyle,
              border: "1px solid rgba(255,255,255,0.15)",
              backgroundColor: "#292524",
            }}
          >
            <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing" {...pipDragProps} />
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            {!videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#292524]">
                <VideoOff size={18} style={{ color: "rgba(255,255,255,0.3)" }} />
              </div>
            )}
            {/* Resize handle */}
            <div {...pipResizeProps}>
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.4 }}>
                <path d="M14 2L2 14M14 6L6 14M14 10L10 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
        {/* Controls */}
        <div className="relative flex items-center justify-center gap-3 py-5" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.4))" }}>
          {showCallDevices && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 p-4 rounded-xl w-80 space-y-3 animate-scale-in"
              style={{ backgroundColor: "rgba(28,25,23,0.95)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}>
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
          <CallBtn active={audioEnabled} onClick={() => setAudioEnabled(!audioEnabled)} icon={audioEnabled ? <Mic size={20} /> : <MicOff size={20} />} danger={!audioEnabled} />
          <CallBtn active={videoEnabled} onClick={() => setVideoEnabled(!videoEnabled)} icon={videoEnabled ? <Video size={20} /> : <VideoOff size={20} />} danger={!videoEnabled} />
          <div className="relative">
            <CallBtn active={chatOpen} onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnreadChat(0); }} icon={<MessageCircle size={20} />} />
            {unreadChat > 0 && !chatOpen && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadChat > 9 ? "9+" : unreadChat}
              </div>
            )}
          </div>
          <div className="relative">
            <CallBtn active={showReactions} onClick={() => setShowReactions(!showReactions)} icon={<Smile size={20} />} />
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
          <CallBtn active={isScreenSharing} onClick={async () => {
            const pc = pcRef.current;
            if (!pc) return;
            if (isScreenSharing) {
              screenTrackRef.current?.stop();
              screenTrackRef.current = null;
              const cam = savedCamTrackRef.current;
              const sender = pc.getSenders().find((s) => s.track?.kind === "video" || !s.track);
              if (sender && cam) await sender.replaceTrack(cam);
              setIsScreenSharing(false);
              return;
            }
            try {
              const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
              const track = ss.getVideoTracks()[0];
              if (!track || track.readyState === "ended") return;
              savedCamTrackRef.current = stream?.getVideoTracks()[0] ?? null;
              const senders = pc.getSenders();
              const sender = senders.find((s) => s.track?.kind === "video")
                ?? senders.find((s) => s.track != null)
                ?? senders[0];
              if (sender) {
                await sender.replaceTrack(track);
              } else {
                // No sender found — try addTrack (may fail in Firefox after negotiation)
                try {
                  pc.addTrack(track, ss);
                } catch (addErr) {
                  console.warn("[Wave] addTrack failed, screen share not supported in this state:", addErr);
                  track.stop();
                  return;
                }
              }
              // Show screen share in local PiP
              if (videoRef.current) videoRef.current.srcObject = ss;
              screenTrackRef.current = track;
              setIsScreenSharing(true);
              track.addEventListener("ended", () => {
                const cam = savedCamTrackRef.current;
                const s = pc.getSenders().find((s) => s.track?.kind === "video" || !s.track) ?? pc.getSenders()[0];
                if (s && cam) s.replaceTrack(cam);
                if (videoRef.current && stream) videoRef.current.srcObject = stream;
                setIsScreenSharing(false);
                screenTrackRef.current = null;
              });
            } catch (e) { console.error("[Wave] Screen share failed:", e); }
          }} icon={<Monitor size={20} />} danger={isScreenSharing} />
          <CallBtn icon={<Settings2 size={20} />} active={showCallDevices} onClick={() => setShowCallDevices(!showCallDevices)} />
          <button onClick={handleHangup} className="flex items-center justify-center w-14 h-14 rounded-full transition-transform hover:scale-105 active:scale-95" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
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
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-white/80 text-sm font-medium">Chat</span>
              <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-white/10" style={{ color: "rgba(255,255,255,0.4)" }}>
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
                      <span className="block text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Input */}
            <div className="px-3 pb-3 pt-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                />
                <button onClick={sendChatMessage} disabled={!chatText.trim()} className="p-1 rounded transition-colors hover:bg-white/10 disabled:opacity-30" style={{ color: "rgba(255,255,255,0.5)" }}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Ended ──
  if (status === "ended") {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: "radial-gradient(ellipse at 30% 20%, #1a1040 0%, #0c0a09 50%, #000 100%)" }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <Phone className="w-8 h-8 text-white/40" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{t("wave.callEnded")}</h1>
          {callDuration > 0 && <p className="text-white/40 text-sm">{formatTime(callDuration)}</p>}
          <button
            onClick={() => onOpenChange(false)}
            className="mt-6 px-6 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {t("wave.close")}
          </button>
        </div>
      </div>
    );
  }

  // ── Waiting for guest ──
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: "radial-gradient(ellipse at 30% 20%, #1a1040 0%, #0c0a09 50%, #000 100%)" }}>
      {/* Animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-96 h-96 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)", top: "10%", left: "20%", animation: "float 20s ease-in-out infinite" }} />
        <div className="absolute w-80 h-80 rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, #22c55e, transparent 70%)", bottom: "10%", right: "15%", animation: "float 25s ease-in-out infinite reverse" }} />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto px-4">
        {/* Status badge */}
        <div className="text-center mb-6">
          {/* Animated wave ring */}
          <div className="relative w-32 h-32 mx-auto mb-8">
            {/* Outer pulsing rings */}
            <div className="absolute inset-0 rounded-full animate-wave-ping" style={{ border: "2px solid rgba(99,102,241,0.3)" }} />
            <div className="absolute inset-2 rounded-full animate-wave-ping" style={{ border: "1.5px solid rgba(99,102,241,0.2)", animationDelay: "0.5s" }} />
            <div className="absolute inset-4 rounded-full animate-wave-ping" style={{ border: "1px solid rgba(99,102,241,0.15)", animationDelay: "1s" }} />
            {/* Inner glowing core */}
            <div className="absolute inset-6 rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))", boxShadow: "0 0 30px rgba(99,102,241,0.3), 0 0 60px rgba(99,102,241,0.1)" }}>
                <Phone size={20} className="text-white/80" />
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">
            {t("wave.inviteSentTo", { name: guestName || guestEmail })}
          </h1>
          <p className="text-white/40 text-sm">{t("wave.waitingHint")}</p>
        </div>

        {/* Camera preview */}
        <div className="rounded-2xl overflow-hidden mb-5 relative" style={{ aspectRatio: "16/10", backgroundColor: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover absolute inset-0"
            style={{ transform: "scaleX(-1)", opacity: videoEnabled ? 1 : 0, transition: "opacity 150ms" }}
          />
          {!videoEnabled && (
            <div className="w-full h-full flex items-center justify-center relative z-10">
              <VideoOff size={32} className="text-white/20" />
            </div>
          )}
          {/* Audio level */}
          {audioEnabled && stream && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <Volume2 size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
              <div className="flex items-end gap-0.5 h-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-1 rounded-full transition-all duration-75" style={{
                    height: Math.max(3, audioLevel > i / 12 ? audioLevel * 16 : 3),
                    backgroundColor: audioLevel > i / 12 ? (i < 8 ? "#22c55e" : i < 10 ? "#f59e0b" : "#ef4444") : "rgba(255,255,255,0.1)",
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <LobbyBtn icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />} active={audioEnabled} danger={!audioEnabled} onClick={() => setAudioEnabled(!audioEnabled)} />
          <LobbyBtn icon={videoEnabled ? <Video size={18} /> : <VideoOff size={18} />} active={videoEnabled} danger={!videoEnabled} onClick={() => setVideoEnabled(!videoEnabled)} />
        </div>

        {/* Device settings — always visible */}
        {(audioDevices.length > 0 || videoDevices.length > 0) && (
          <div className="mb-5 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <Settings2 size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
              <label className="text-[11px] font-medium text-white/40">Device settings</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
          </div>
        )}

        {/* Share link */}
        <div className="mb-5 p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="flex-1 text-xs text-white/50 truncate font-mono">{joinUrl}</span>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
            style={{
              backgroundColor: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
              color: copied ? "#22c55e" : "rgba(255,255,255,0.7)",
              border: `1px solid ${copied ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.1)"}`,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t("wave.copied") : t("wave.copyLink")}
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={handleHangup}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors"
          style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <PhoneOff size={18} />
          {t("wave.cancelCall")}
        </button>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
        @keyframes wave-ping {
          0% { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(1.5); opacity: 0; }
        }
        .animate-wave-ping {
          animation: wave-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes reaction-float {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-150px) scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
});

function LobbyBtn({ icon, active, danger, onClick }: { icon: React.ReactNode; active: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-150 hover:scale-[1.05] active:scale-[0.95]" style={{
      backgroundColor: danger ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
      color: danger ? "#f87171" : "rgba(255,255,255,0.75)",
      border: `1px solid ${danger ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)"}`,
    }}>
      {icon}
    </button>
  );
}

function CallBtn({ active, danger, onClick, icon }: { active: boolean; danger?: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-150 hover:scale-105 active:scale-95" style={{
      backgroundColor: danger ? "rgba(239,68,68,0.2)" : active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.1)",
      border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
      color: danger ? "#f87171" : "white",
    }}>
      {icon}
    </button>
  );
}
