/** Wave video call UI — premium floating window with chat, reactions, PiP */

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Maximize2, Minimize2,
  Loader2, Wifi, WifiOff, MessageCircle, Smile, PictureInPicture, X, Send,
  Settings2, ImageIcon, Ban,
} from "lucide-react";
import { useWaveStore } from "@/stores/wave-store.ts";
import type { ChatMessage } from "@/stores/wave-store.ts";
import { useWave } from "@/hooks/use-wave.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { useTranslation } from "react-i18next";
import { useDraggable, useResizable } from "@/hooks/use-draggable.ts";
import type { NetworkQuality } from "@/lib/wave.ts";
import { DarkSelect } from "./dark-select.tsx";
import { playConnectSound, playDisconnectSound } from "@/lib/wave-sounds.ts";
import { BackgroundProcessor, VIRTUAL_BACKGROUNDS, type BackgroundEffect } from "@/lib/wave-background.ts";

const REACTION_EMOJIS = ["👍", "👏", "😂", "❤️", "🎉", "🤔", "👋", "🔥"];

export const WaveCall = React.memo(function WaveCall() {
  const { t } = useTranslation();
  const callState = useWaveStore((s) => s.callState);
  const peerEmail = useWaveStore((s) => s.peerEmail);
  const peerName = useWaveStore((s) => s.peerName);
  const isMuted = useWaveStore((s) => s.isMuted);
  const isVideoOff = useWaveStore((s) => s.isVideoOff);
  const isScreenSharing = useWaveStore((s) => s.isScreenSharing);
  const localStream = useWaveStore((s) => s.localStream);
  const remoteStream = useWaveStore((s) => s.remoteStream);
  const callStartTime = useWaveStore((s) => s.callStartTime);
  const networkQuality = useWaveStore((s) => s.networkQuality);
  const chatMessages = useWaveStore((s) => s.chatMessages);
  const chatOpen = useWaveStore((s) => s.chatOpen);
  const unreadChat = useWaveStore((s) => s.unreadChat);
  const reactions = useWaveStore((s) => s.reactions);

  const { hangup, toggleMute, toggleVideo, toggleScreenShare, sendChat, sendReaction, enablePiP, switchAudioDevice, switchVideoDevice, replaceLocalVideoTrack } = useWave();
  const setChatOpen = useWaveStore((s) => s.setChatOpen);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [duration, setDuration] = useState("00:00");
  const [showReactions, setShowReactions] = useState(false);
  const [chatText, setChatText] = useState("");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>({ mode: "none" });
  const [bgLoading, setBgLoading] = useState(false);
  const bgProcessorRef = useRef<BackgroundProcessor | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const prevCallState = useRef(callState);
  const { handleProps: dragHandleProps, containerStyle: dragStyle } = useDraggable();
  const { handleProps: pipDragProps, containerStyle: pipDragStyle } = useDraggable({ x: window.innerWidth - 260, y: window.innerHeight - 220 });
  const { size: pipSize, resizeHandleProps: pipResizeProps } = useResizable({ width: 240, height: 180 });

  // Play connect/disconnect sounds
  useEffect(() => {
    if (callState === "connected" && prevCallState.current !== "connected") {
      playConnectSound();
    }
    if (callState === "ended" && prevCallState.current !== "ended") {
      playDisconnectSound();
    }
    prevCallState.current = callState;
  }, [callState]);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Enumerate devices when localStream becomes available
  useEffect(() => {
    if (!localStream) return;
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setAudioDevices(devices.filter(d => d.kind === "audioinput"));
      setVideoDevices(devices.filter(d => d.kind === "videoinput"));
      setSpeakerDevices(devices.filter(d => d.kind === "audiooutput"));
    });
  }, [localStream]);

  // Switch audio device via WaveConnection
  useEffect(() => {
    if (!selectedAudioDevice) return;
    switchAudioDevice(selectedAudioDevice);
  }, [selectedAudioDevice, switchAudioDevice]);

  // Switch video device via WaveConnection
  useEffect(() => {
    if (!selectedVideoDevice) return;
    switchVideoDevice(selectedVideoDevice);
  }, [selectedVideoDevice, switchVideoDevice]);

  // Apply speaker (audio output) selection to remote video element
  useEffect(() => {
    if (remoteVideoRef.current && selectedSpeaker && 'setSinkId' in remoteVideoRef.current) {
      (remoteVideoRef.current as any).setSinkId(selectedSpeaker).catch(() => {});
    }
  }, [selectedSpeaker, remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (callState !== "connected" || !callStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setDuration(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState, callStartTime]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  const handleSendChat = useCallback(() => {
    if (!chatText.trim()) return;
    sendChat(chatText.trim());
    setChatText("");
    chatInputRef.current?.focus();
  }, [chatText, sendChat]);

  if (callState === "idle") return null;

  const peerAddress = { name: peerName, email: peerEmail ?? "" };
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled;

  if (isCompact) {
    // Compact PiP mode — draggable
    return (
      <div
        data-draggable
        className="fixed z-[9998] rounded-2xl overflow-hidden wave-surface wave-surface-border"
        style={{
          width: 200,
          height: 150,
          ...pipDragStyle,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
          border: "1px solid",
        }}
      >
        <div className="absolute inset-0 z-10" {...pipDragProps} onDoubleClick={() => setIsCompact(false)} />
        {hasRemoteVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar address={peerAddress} size={48} />
          </div>
        )}
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1 flex items-center justify-between pointer-events-none"
          style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
        >
          <span className="text-white text-[10px] font-medium">{duration}</span>
          <Maximize2 size={12} className="wave-text-secondary" />
        </div>
      </div>
    );
  }

  // Full call window
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
    >
      {/* Floating reactions */}
      <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute text-4xl animate-bounce"
            style={{
              left: `${Math.random() * 200 - 100}px`,
              animation: "reaction-float 3s ease-out forwards",
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      <div
        data-draggable
        className="relative flex rounded-2xl overflow-hidden"
        style={{
          width: chatOpen ? "min(95vw, 1200px)" : "min(90vw, 900px)",
          height: "min(80vh, 600px)",
          backgroundColor: "#0c0a09",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          position: "relative",
          ...dragStyle,
          transition: "width 200ms ease",
        }}
      >
        {/* Main call area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Drag handle — top bar area */}
          <div className="absolute top-0 left-0 right-0 h-10 z-20" {...dragHandleProps} />

          {/* Remote video / avatar */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {callState === "connected" && hasRemoteVideo ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" style={{ backgroundColor: "#000" }} />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Avatar address={peerAddress} size={96} />
                <div className="text-white text-lg font-semibold">{peerName || peerEmail}</div>
                <div className="text-white/50 text-sm">
                  {callState === "ringing" && t("wave.ringing")}
                  {callState === "connecting" && t("wave.connecting")}
                  {callState === "connected" && duration}
                  {callState === "ended" && t("wave.callEnded")}
                </div>
                {(callState === "ringing" || callState === "connecting") && (
                  <div className="relative w-20 h-20 mt-4">
                    <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(99,102,241,0.3)", animation: "wave-ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />
                    <div className="absolute inset-2 rounded-full" style={{ border: "1.5px solid rgba(99,102,241,0.2)", animation: "wave-ping 2s cubic-bezier(0,0,0.2,1) infinite 0.5s" }} />
                    <div className="absolute inset-4 rounded-full flex items-center justify-center animate-pulse" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)" }} />
                  </div>
                )}
              </div>
            )}

            {/* Top bar — participant info + network + duration */}
            {callState === "connected" && (
              <div
                className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-white/80 text-xs font-medium">{peerName || peerEmail}</span>
                  </div>
                  <NetworkIndicator quality={networkQuality} />
                </div>
                <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                  <span className="text-white/80 text-xs font-mono">{duration}</span>
                </div>
              </div>
            )}

            {/* Local video PiP — draggable + resizable */}
            {localStream && callState !== "ended" && (
              <div
                data-draggable
                className="fixed z-[9999] rounded-xl overflow-hidden"
                style={{
                  width: pipSize.width,
                  height: pipSize.height,
                  backgroundColor: "#292524",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  ...pipDragStyle,
                }}
              >
                <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing" {...pipDragProps} />
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
                {isVideoOff && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "#292524" }}>
                    <VideoOff size={20} className="wave-text-tertiary" />
                  </div>
                )}
                {/* Resize handle */}
                <div {...pipResizeProps}>
                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.4 }}>
                    <path d="M14 2L2 14M14 6L6 14M14 10L10 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}

            {/* Minimize button */}
            <button
              onClick={() => setIsCompact(true)}
              className="absolute top-4 right-4 p-2 rounded-lg transition-colors z-20 wave-surface-elevated wave-text-secondary"
            >
              <Minimize2 size={16} />
            </button>
          </div>

          {/* Controls bar */}
          <div
            className="flex items-center justify-center gap-2 py-4 px-6"
            style={{ background: "linear-gradient(to top, rgba(12, 10, 9, 1), rgba(12, 10, 9, 0.8))" }}
          >
            <ControlButton icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />} active={isMuted} danger={isMuted} onClick={toggleMute} title={isMuted ? t("wave.unmute") : t("wave.mute")} />
            <ControlButton icon={isVideoOff ? <VideoOff size={20} /> : <Video size={20} />} active={isVideoOff} danger={isVideoOff} onClick={toggleVideo} title={isVideoOff ? t("wave.cameraOn") : t("wave.cameraOff")} />
            <ControlButton icon={<Monitor size={20} />} active={isScreenSharing} onClick={toggleScreenShare} title={isScreenSharing ? t("wave.stopSharing") : t("wave.shareScreen")} />

            <div className="w-px h-8 bg-white/10 mx-1" />

            {/* Chat toggle */}
            <div className="relative">
              <ControlButton
                icon={<MessageCircle size={20} />}
                active={chatOpen}
                onClick={() => setChatOpen(!chatOpen)}
                title={t("wave.chat")}
              />
              {unreadChat > 0 && !chatOpen && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadChat > 9 ? "9+" : unreadChat}
                </div>
              )}
            </div>

            {/* Reactions */}
            <div className="relative">
              <ControlButton
                icon={<Smile size={20} />}
                active={showReactions}
                onClick={() => setShowReactions(!showReactions)}
                title={t("wave.reactions")}
              />
              {showReactions && (
                <div
                  className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-1.5 rounded-xl animate-scale-in wave-surface wave-surface-border"
                  style={{ border: "1px solid", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
                >
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { sendReaction(emoji); setShowReactions(false); }}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 active:scale-90 hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Browser PiP */}
            {document.pictureInPictureEnabled && (
              <ControlButton
                icon={<PictureInPicture size={20} />}
                active={false}
                onClick={() => enablePiP(remoteVideoRef.current)}
                title={t("wave.pip")}
              />
            )}

            {/* Background effects */}
            <div className="relative">
              <ControlButton
                icon={<ImageIcon size={20} />}
                active={bgEffect.mode !== "none"}
                onClick={() => { setShowBackgrounds(!showBackgrounds); setShowDeviceSettings(false); }}
                title={t("wave.background")}
              />
              {showBackgrounds && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 p-4 rounded-xl w-96 animate-scale-in wave-surface wave-surface-border"
                  style={{ backgroundColor: "rgba(28,25,23,0.95)", border: "1px solid", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", zIndex: 10 }}>
                  <label className="text-[11px] font-medium wave-text-tertiary block mb-2">{t("wave.background")}</label>
                  {bgLoading && <div className="text-xs wave-text-tertiary mb-2">{t("wave.loadingBackground")}</div>}
                  <div className="grid grid-cols-5 gap-2">
                    {/* None option */}
                    <button
                      onClick={async () => {
                        setBgEffect({ mode: "none" });
                        bgProcessorRef.current?.stop();
                        bgProcessorRef.current = null;
                        // Restore original stream to local video
                        if (localVideoRef.current && localStream) {
                          localVideoRef.current.srcObject = localStream;
                          const origTrack = localStream.getVideoTracks()[0];
                          if (origTrack) await replaceLocalVideoTrack(origTrack);
                        }
                      }}
                      className="relative aspect-square rounded-lg overflow-hidden transition-all hover:scale-105 wave-surface-elevated"
                      style={{
                        border: bgEffect.mode === "none" ? "2px solid #6366f1" : "2px solid transparent",
                      }}
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        <Ban size={16} className="wave-text-tertiary" />
                      </div>
                    </button>
                    {/* Virtual backgrounds */}
                    {VIRTUAL_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        onClick={async () => {
                          if (!localStream) return;
                          setBgLoading(true);
                          const effect: BackgroundEffect = bg.mode === "blur"
                            ? { mode: "blur", blurStrength: bg.blurStrength }
                            : { mode: "image", imageUrl: bg.preview };
                          setBgEffect(effect);
                          try {
                            if (!bgProcessorRef.current) bgProcessorRef.current = new BackgroundProcessor();
                            bgProcessorRef.current.setInput(localStream);
                            bgProcessorRef.current.setEffect(effect);
                            const processed = await bgProcessorRef.current.start();
                            if (localVideoRef.current) localVideoRef.current.srcObject = processed;
                            const videoTrack = processed.getVideoTracks()[0];
                            if (videoTrack) await replaceLocalVideoTrack(videoTrack);
                          } catch (e) {
                            console.error("[Wave] Background failed:", e);
                            setBgEffect({ mode: "none" });
                          } finally {
                            setBgLoading(false);
                          }
                        }}
                        className="relative aspect-square rounded-lg overflow-hidden transition-all hover:scale-105"
                        style={{
                          background: bg.preview,
                          border: (bgEffect.mode === bg.mode && (bg.mode === "blur" ? bgEffect.blurStrength === bg.blurStrength : bgEffect.imageUrl === bg.preview))
                            ? "2px solid #6366f1" : "2px solid transparent",
                        }}
                      >
                        <span className="absolute bottom-0.5 left-0 right-0 text-[8px] font-medium text-white/80 text-center drop-shadow-sm">{bg.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Device settings */}
            <div className="relative">
              <ControlButton
                icon={<Settings2 size={20} />}
                active={showDeviceSettings}
                onClick={() => { setShowDeviceSettings(!showDeviceSettings); setShowBackgrounds(false); }}
                title="Device settings"
              />
              {showDeviceSettings && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 p-4 rounded-xl w-80 space-y-3 animate-scale-in wave-surface wave-surface-border"
                  style={{ backgroundColor: "rgba(28,25,23,0.95)", border: "1px solid", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}>
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
            </div>

            <div className="w-px h-8 bg-white/10 mx-1" />

            {/* Hang up */}
            <button
              onClick={hangup}
              className="flex items-center justify-center w-14 h-14 rounded-full transition-all duration-150 hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, var(--color-danger), var(--color-danger-dark))", color: "white", boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)" }}
              title={t("wave.hangUp")}
            >
              <PhoneOff size={22} />
            </button>
          </div>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div
            className="flex flex-col shrink-0 wave-surface"
            style={{ width: 300, borderLeft: "1px solid rgba(255,255,255,0.08)" }}
          >
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="wave-text text-sm font-medium">{t("wave.chat")}</span>
              <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-white/10 wave-text-tertiary">
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-white/20 text-xs">{t("wave.chatEmpty")}</div>
              )}
              {chatMessages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
            </div>

            {/* Input */}
            <div className="px-3 pb-3 pt-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendChat(); }}
                  placeholder={t("wave.chatPlaceholder")}
                  className="flex-1 bg-transparent text-xs outline-none wave-text"
                />
                <button onClick={handleSendChat} disabled={!chatText.trim()} className="p-1 rounded transition-colors hover:bg-white/10 disabled:opacity-30 wave-text-secondary">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reaction float animation */}
      <style>{`
        @keyframes reaction-float {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-150px) scale(1.5); opacity: 0; }
        }
        @keyframes wave-ping {
          0% { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
});

/** Network quality indicator */
function NetworkIndicator({ quality }: { quality: NetworkQuality }) {
  const colors: Record<NetworkQuality, string> = {
    excellent: "var(--color-success)",
    good: "var(--color-success)",
    fair: "#f59e0b",
    poor: "var(--color-danger)",
    unknown: "rgba(255,255,255,0.3)",
  };
  const bars = quality === "excellent" ? 4 : quality === "good" ? 3 : quality === "fair" ? 2 : quality === "poor" ? 1 : 0;
  const color = colors[quality];

  return (
    <div className="flex items-end gap-0.5 h-3.5" title={`Network: ${quality}`}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-1 rounded-full transition-colors"
          style={{
            height: `${i * 25}%`,
            backgroundColor: i <= bars ? color : "rgba(255,255,255,0.15)",
          }}
        />
      ))}
    </div>
  );
}

/** Chat message bubble */
function ChatBubble({ message }: { message: ChatMessage }) {
  const isMe = message.from === "me";
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-1.5 rounded-xl text-xs"
        style={{
          backgroundColor: isMe ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)",
          color: isMe ? "#93c5fd" : "rgba(255,255,255,0.8)",
          borderBottomRightRadius: isMe ? 4 : undefined,
          borderBottomLeftRadius: !isMe ? 4 : undefined,
        }}
      >
        <p className="break-words whitespace-pre-wrap">{message.text}</p>
        <span className="block text-[10px] mt-0.5 wave-text-tertiary">{time}</span>
      </div>
    </div>
  );
}

function ControlButton({
  icon, active, danger, onClick, title,
}: {
  icon: React.ReactNode; active?: boolean; danger?: boolean; onClick: () => void; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-11 h-11 rounded-full transition-all duration-150 hover:scale-105 active:scale-95"
      style={{
        backgroundColor: active ? (danger ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)") : "rgba(255,255,255,0.08)",
        color: active ? (danger ? "var(--color-danger)" : "#60a5fa") : "rgba(255,255,255,0.8)",
        border: `1px solid ${active ? (danger ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)") : "rgba(255,255,255,0.08)"}`,
      }}
      title={title}
    >
      {icon}
    </button>
  );
}
