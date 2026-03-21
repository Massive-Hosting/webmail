/** Wave video call UI — premium floating window with draggable PiP */

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Maximize2, Minimize2, Loader2,
} from "lucide-react";
import { useWaveStore } from "@/stores/wave-store.ts";
import { useWave } from "@/hooks/use-wave.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { useTranslation } from "react-i18next";
import { useDraggable } from "@/hooks/use-draggable.ts";

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

  const { hangup, toggleMute, toggleVideo, toggleScreenShare } = useWave();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [duration, setDuration] = useState("00:00");
  const { handleProps: dragHandleProps, containerStyle: dragStyle } = useDraggable();
  const { handleProps: pipDragProps, containerStyle: pipDragStyle } = useDraggable({ x: window.innerWidth - 220, y: window.innerHeight - 170 });

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

  if (callState === "idle") return null;

  const peerAddress = { name: peerName, email: peerEmail ?? "" };
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled;

  if (isCompact) {
    // Compact PiP mode — draggable
    return (
      <div
        data-draggable
        className="fixed z-[9998] rounded-2xl overflow-hidden"
        style={{
          width: 200,
          height: 150,
          backgroundColor: "#1c1917",
          ...pipDragStyle,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Drag handle for PiP */}
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
          <Maximize2 size={12} style={{ color: "rgba(255,255,255,0.6)" }} />
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
      <div
        data-draggable
        className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: "min(90vw, 900px)",
          height: "min(80vh, 600px)",
          backgroundColor: "#0c0a09",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
          position: "relative",
          ...dragStyle,
        }}
      >
        {/* Drag handle — top bar area */}
        <div
          className="absolute top-0 left-0 right-0 h-10 z-20"
          {...dragHandleProps}
        />

        {/* Remote video / avatar */}
        <div className="flex-1 relative overflow-hidden flex items-center justify-center">
          {callState === "connected" && hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Avatar address={peerAddress} size={96} />
              <div className="text-white text-lg font-semibold">{peerEmail}</div>
              {peerName && peerName !== peerEmail && (
                <div className="text-white/40 text-xs -mt-2">{peerName}</div>
              )}
              <div className="text-white/50 text-sm">
                {callState === "ringing" && t("wave.ringing")}
                {callState === "connecting" && t("wave.connecting")}
                {callState === "connected" && duration}
                {callState === "ended" && t("wave.callEnded")}
              </div>
              {(callState === "ringing" || callState === "connecting") && (
                <Loader2 size={24} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
              )}
            </div>
          )}

          {/* Call duration badge (connected with video) */}
          {callState === "connected" && hasRemoteVideo && (
            <div
              className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                color: "rgba(255, 255, 255, 0.8)",
                backdropFilter: "blur(8px)",
              }}
            >
              {duration}
            </div>
          )}

          {/* Local video PiP */}
          {localStream && callState !== "ended" && (
            <div
              className="absolute bottom-4 right-4 rounded-xl overflow-hidden"
              style={{
                width: 180,
                height: 135,
                backgroundColor: "#292524",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {isVideoOff && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "#292524" }}>
                  <VideoOff size={20} style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
              )}
            </div>
          )}

          {/* Minimize button */}
          <button
            onClick={() => setIsCompact(true)}
            className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.6)",
            }}
          >
            <Minimize2 size={16} />
          </button>
        </div>

        {/* Controls bar */}
        <div
          className="flex items-center justify-center gap-3 py-5 px-6"
          style={{
            background: "linear-gradient(to top, rgba(12, 10, 9, 1), rgba(12, 10, 9, 0.8))",
          }}
        >
          <ControlButton
            icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            label={isMuted ? t("wave.unmute") : t("wave.mute")}
            active={isMuted}
            danger={isMuted}
            onClick={toggleMute}
          />
          <ControlButton
            icon={isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            label={isVideoOff ? t("wave.cameraOn") : t("wave.cameraOff")}
            active={isVideoOff}
            danger={isVideoOff}
            onClick={toggleVideo}
          />
          <ControlButton
            icon={<Monitor size={20} />}
            label={isScreenSharing ? t("wave.stopSharing") : t("wave.shareScreen")}
            active={isScreenSharing}
            onClick={toggleScreenShare}
          />

          {/* Hang up */}
          <button
            onClick={hangup}
            className="flex items-center justify-center w-14 h-14 rounded-full transition-all duration-150 hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "white",
              boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)",
            }}
            title={t("wave.hangUp")}
          >
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
});

function ControlButton({
  icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-150 hover:scale-105 active:scale-95"
      style={{
        backgroundColor: active
          ? danger
            ? "rgba(239, 68, 68, 0.2)"
            : "rgba(59, 130, 246, 0.2)"
          : "rgba(255, 255, 255, 0.1)",
        color: active
          ? danger
            ? "#ef4444"
            : "#60a5fa"
          : "rgba(255, 255, 255, 0.8)",
        border: `1px solid ${active ? (danger ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)") : "rgba(255, 255, 255, 0.1)"}`,
      }}
      title={label}
    >
      {icon}
    </button>
  );
}
