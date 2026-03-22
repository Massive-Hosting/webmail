/** Wave Guest Join — dangerously sexy public lobby for external call recipients */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2,
  Settings2, Loader2,
} from "lucide-react";

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
  const [showDevices, setShowDevices] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callDuration, setCallDuration] = useState(0);

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
        audio: true,
        video: true,
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
    if (!stream) return;
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

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
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
      <div className="fixed inset-0 bg-black flex flex-col">
        {/* Remote video */}
        <div className="flex-1 relative">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {roomState === "connecting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-white/60 animate-spin mx-auto mb-3" />
                <p className="text-white/60 text-sm">Connecting to {room?.host_name}...</p>
              </div>
            </div>
          )}
          {/* Local PiP */}
          <div className="absolute bottom-4 right-4 w-40 rounded-xl overflow-hidden shadow-2xl border border-white/10">
            <video ref={videoRef} autoPlay playsInline muted className="w-full" style={{ transform: "scaleX(-1)" }} />
          </div>
          {/* Duration badge */}
          {roomState === "connected" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
              <span className="text-white/80 text-xs font-mono">{formatTime(callDuration)}</span>
            </div>
          )}
        </div>
        {/* Controls */}
        <div className="flex items-center justify-center gap-3 py-5 bg-gradient-to-t from-black/80 to-transparent">
          <ControlButton active={audioEnabled} onClick={() => setAudioEnabled(!audioEnabled)} icon={audioEnabled ? <Mic size={20} /> : <MicOff size={20} />} />
          <ControlButton active={videoEnabled} onClick={() => setVideoEnabled(!videoEnabled)} icon={videoEnabled ? <Video size={20} /> : <VideoOff size={20} />} />
          <button onClick={hangup} className="flex items-center justify-center w-14 h-14 rounded-full transition-transform hover:scale-105 active:scale-95" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
            <PhoneOff size={22} className="text-white" />
          </button>
        </div>
      </div>
    );
  }

  // Lobby — the sexy part
  return (
    <FullScreenBg>
      <div className="w-full max-w-lg mx-auto px-4">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/60 text-xs font-medium tracking-wide uppercase">Wave Call</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {room?.host_name} is calling
          </h1>
          <p className="text-white/40 text-sm">Set up your camera and mic, then join the call</p>
        </div>

        {/* Video preview card */}
        <div className="rounded-2xl overflow-hidden mb-6 relative" style={{ aspectRatio: "16/10", backgroundColor: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover absolute inset-0"
            style={{ transform: "scaleX(-1)", opacity: videoEnabled ? 1 : 0, transition: "opacity 150ms" }}
          />
          {!videoEnabled && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 relative z-10">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-white/10">
                <span className="text-2xl font-bold text-white/70">{(guestName || "G")[0].toUpperCase()}</span>
              </div>
              <span className="text-white/30 text-xs">Camera off</span>
            </div>
          )}
          {/* Audio level meter */}
          {audioEnabled && stream && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <Volume2 size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
              <div className="flex items-end gap-0.5 h-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full transition-all duration-75"
                    style={{
                      height: Math.max(3, audioLevel > i / 12 ? audioLevel * 16 : 3),
                      backgroundColor: audioLevel > i / 12 ? (i < 8 ? "#22c55e" : i < 10 ? "#f59e0b" : "#ef4444") : "rgba(255,255,255,0.1)",
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
            className="w-full px-4 py-3 rounded-xl text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-indigo-500/30"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.1)",
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
          <LobbyBtn
            icon={<Settings2 size={18} />}
            label="Devices"
            active={false}
            accent={showDevices}
            onClick={() => setShowDevices(!showDevices)}
          />
        </div>

        {/* Device selection */}
        {showDevices && (
          <div className="mb-6 p-4 rounded-xl space-y-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {audioDevices.length > 0 && (
              <div>
                <label className="text-[11px] font-medium text-white/40 block mb-1">Microphone</label>
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-lg outline-none cursor-pointer appearance-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} style={{ backgroundColor: "#1c1917", color: "#d6d3d1" }}>{d.label || `Mic ${d.deviceId.slice(0, 4)}`}</option>
                  ))}
                </select>
              </div>
            )}
            {videoDevices.length > 0 && (
              <div>
                <label className="text-[11px] font-medium text-white/40 block mb-1">Camera</label>
                <select
                  value={selectedVideoDevice}
                  onChange={(e) => setSelectedVideoDevice(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-lg outline-none cursor-pointer appearance-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} style={{ backgroundColor: "#1c1917", color: "#d6d3d1" }}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Join button */}
        <button
          onClick={joinCall}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
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
            background: "radial-gradient(circle, #22c55e, transparent 70%)",
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
  const color = danger ? "#f87171" : accent ? "#818cf8" : "rgba(255,255,255,0.75)";
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
        color: active ? "white" : "#f87171",
      }}
    >
      {icon}
    </button>
  );
}
