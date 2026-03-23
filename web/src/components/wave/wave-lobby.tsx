/** Wave pre-call lobby — camera preview, device selection, audio level meter */

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, Mic, MicOff, Video, VideoOff, Phone, Monitor, Settings2, Volume2, ImageIcon, Ban,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar.tsx";
import { useAuthStore } from "@/stores/auth-store.ts";
import { useTranslation } from "react-i18next";
import { useDraggable } from "@/hooks/use-draggable.ts";
import { DarkSelect } from "./dark-select.tsx";
import { BackgroundProcessor, VIRTUAL_BACKGROUNDS, type BackgroundEffect } from "@/lib/wave-background.ts";
import { unlockAudio } from "@/lib/wave-sounds.ts";
import { getVideoConstraints } from "@/lib/wave.ts";
import { useWaveStore, VIDEO_QUALITY_CONSTRAINTS, type VideoQuality } from "@/stores/wave-store.ts";

interface WaveLobbyProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerEmail: string;
  peerName: string;
  /** Called when user clicks "Start call" with their chosen settings */
  onStartCall: (settings: { video: boolean; audioDeviceId?: string; videoDeviceId?: string }) => void;
}

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: string;
}

export const WaveLobby = React.memo(function WaveLobby({
  open,
  onOpenChange,
  peerEmail,
  peerName,
  onStartCall,
}: WaveLobbyProps) {
  const { t } = useTranslation();
  const email = useAuthStore((s) => s.email);
  const displayName = useAuthStore((s) => s.displayName);

  const { handleProps: dragHandleProps, containerStyle: dragStyle } = useDraggable();

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionState, setPermissionState] = useState<"pending" | "granted" | "denied">("pending");
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>({ mode: "none" });
  const [bgLoading, setBgLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const bgProcessorRef = useRef<BackgroundProcessor | null>(null);
  const initializedRef = useRef(false);

  // Start preview when dialog opens
  useEffect(() => {
    if (!open) {
      // Clean up on close
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        setStream(null);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
      setPermissionState("pending");
      initializedRef.current = false;
      return;
    }

    // On first open, always request media to trigger browser permission prompt
    if (!initializedRef.current) {
      initializedRef.current = true;
      startPreview();
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [open]);

  // Replace only the audio track when mic device changes (keeps video untouched)
  useEffect(() => {
    if (!open || !initializedRef.current || permissionState !== "granted" || !stream || !selectedAudioDevice) return;
    // Check if the current audio track already uses this device
    const currentAudio = stream.getAudioTracks()[0];
    if (currentAudio?.getSettings().deviceId === selectedAudioDevice) return;

    (async () => {
      try {
        const newAudio = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedAudioDevice } },
        });
        const newTrack = newAudio.getAudioTracks()[0];
        // Remove old audio track, add new one
        if (currentAudio) stream.removeTrack(currentAudio);
        currentAudio?.stop();
        if (newTrack) {
          newTrack.enabled = audioEnabled;
          stream.addTrack(newTrack);
        }
        // Reconnect audio analyser
        reconnectAudioAnalyser(stream);
      } catch (e) {
        console.error("[Wave] Failed to switch audio device:", e);
      }
    })();
  }, [selectedAudioDevice]);

  // Replace only the video track when camera device changes (keeps audio untouched)
  useEffect(() => {
    if (!open || !initializedRef.current || permissionState !== "granted" || !stream || !selectedVideoDevice) return;
    const currentVideo = stream.getVideoTracks()[0];
    if (currentVideo?.getSettings().deviceId === selectedVideoDevice) return;

    (async () => {
      try {
        const newVideo = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedVideoDevice } },
        });
        const newTrack = newVideo.getVideoTracks()[0];
        if (currentVideo) stream.removeTrack(currentVideo);
        currentVideo?.stop();
        if (newTrack) {
          newTrack.enabled = videoEnabled;
          stream.addTrack(newTrack);
        }
      } catch (e) {
        console.error("[Wave] Failed to switch video device:", e);
      }
    })();
  }, [selectedVideoDevice]);

  // Toggle tracks in-place when mic/camera buttons are pressed (no stream restart)
  useEffect(() => {
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      track.enabled = audioEnabled;
    }
  }, [audioEnabled, stream]);

  useEffect(() => {
    if (!stream) return;
    for (const track of stream.getVideoTracks()) {
      track.enabled = videoEnabled;
    }
    // Re-attach srcObject when re-enabling video (track was disabled, element may need refresh)
    if (videoEnabled && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [videoEnabled, stream]);

  /** Reconnect audio analyser to a (possibly new) stream for the level meter */
  const reconnectAudioAnalyser = useCallback((mediaStream: MediaStream) => {
    // Clean up old analyser
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    if (mediaStream.getAudioTracks().length === 0) return;

    const ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(mediaStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setAudioLevel(Math.min(1, rms * 4));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startPreview = useCallback(async () => {
    // Stop previous stream
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { ...getVideoConstraints(), facingMode: "user" },
      });
      setStream(mediaStream);
      setPermissionState("granted");

      // If user toggled audio off, mute the track but keep permission
      if (!audioEnabled) {
        for (const track of mediaStream.getAudioTracks()) track.enabled = false;
      }

      // Attach video
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Set up audio level meter
      reconnectAudioAnalyser(mediaStream);

      // Enumerate devices (need permission first to get labels)
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`, kind: d.kind })),
      );
      setVideoDevices(
        devices
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}`, kind: d.kind })),
      );
    } catch (err) {
      console.error("[Wave] Media access error:", err);
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermissionState("denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        // No camera/mic found — try audio only
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          setStream(audioOnly);
          setPermissionState("granted");
          setVideoEnabled(false);
        } catch {
          setPermissionState("denied");
        }
      } else {
        console.error("[Wave] Unexpected getUserMedia error:", name, err);
        setPermissionState("denied");
      }
    }
  }, [stream, audioEnabled, reconnectAudioAnalyser]);

  const handleStartCall = useCallback(() => {
    unlockAudio();
    // Stop preview stream — the actual call will create its own
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      setStream(null);
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    onStartCall({
      video: videoEnabled,
      audioDeviceId: selectedAudioDevice || undefined,
      videoDeviceId: selectedVideoDevice || undefined,
    });
    onOpenChange(false);
  }, [stream, videoEnabled, selectedAudioDevice, selectedVideoDevice, onStartCall, onOpenChange]);

  const peerAddress = { name: peerName, email: peerEmail };
  const selfAddress = { name: displayName || email, email };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[9999]"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
        />
        <Dialog.Content
          data-draggable
          aria-describedby={undefined}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={`fixed z-[9999] rounded-2xl overflow-hidden flex flex-col animate-scale-in ${dragStyle.left == null ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : ""}`}
          style={{
            width: 720,
            maxWidth: "94vw",
            maxHeight: "92vh",
            backgroundColor: "#1c1917",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            ...dragStyle,
            boxShadow: "0 32px 80px rgba(0, 0, 0, 0.6)",
          }}
        >
          {/* Header — drag handle */}
          <div className="flex items-center justify-between px-6 py-4" {...dragHandleProps}>
            <Dialog.Title className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
              >
                <Phone size={16} style={{ color: "white" }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{t("wave.readyToCall")}</div>
              </div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{ color: "rgba(255,255,255,0.5)" }}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto min-h-0">

          {/* Calling: peer info */}
          <div className="mx-6 mb-4 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Avatar address={peerAddress} size={40} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{peerName}</div>
              <div className="text-xs text-white/40 truncate">{peerEmail}</div>
            </div>
          </div>

          {/* Video preview */}
          <div className="mx-6 mb-4 relative rounded-xl overflow-hidden" style={{ aspectRatio: "16/9", backgroundColor: "#0c0a09" }}>
            {/* Always mount the video element to preserve srcObject across toggles */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover absolute inset-0"
              style={{
                transform: "scaleX(-1)",
                opacity: videoEnabled && permissionState !== "denied" ? 1 : 0,
                transition: "opacity 150ms ease",
              }}
            />
            {/* Overlay when camera is off or permission issue */}
            {(!videoEnabled || permissionState !== "granted") && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 relative z-10">
                <Avatar address={selfAddress} size={72} />
                {permissionState === "denied" ? (
                  <div className="text-xs text-red-400 text-center px-8">
                    {t("wave.permissionDenied")}
                  </div>
                ) : permissionState === "pending" ? (
                  <div className="text-xs text-white/50 text-center px-8">
                    {t("wave.permissionPending")}
                  </div>
                ) : (
                  <div className="text-xs text-white/30">Camera off</div>
                )}
              </div>
            )}

            {/* Audio level indicator */}
            {audioEnabled && permissionState === "granted" && (
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <Volume2 size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
                <div className="flex items-end gap-0.5 h-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full transition-all duration-75"
                      style={{
                        height: Math.max(3, (audioLevel > i / 12 ? audioLevel * 16 : 3)),
                        backgroundColor: audioLevel > i / 12
                          ? i < 8 ? "#22c55e" : i < 10 ? "#f59e0b" : "#ef4444"
                          : "rgba(255,255,255,0.15)",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Toggle buttons — premium pill style with labels */}
          <div className="flex items-center justify-center gap-2 px-6 mb-4">
            <LobbyToggle
              icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              label={audioEnabled ? t("wave.mute") : t("wave.unmute")}
              active={audioEnabled}
              danger={!audioEnabled}
              onClick={() => setAudioEnabled(!audioEnabled)}
            />
            <LobbyToggle
              icon={videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              label={videoEnabled ? t("wave.cameraOff") : t("wave.cameraOn")}
              active={videoEnabled}
              danger={!videoEnabled}
              onClick={() => setVideoEnabled(!videoEnabled)}
            />
            <LobbyToggle
              icon={<ImageIcon size={18} />}
              label={t("wave.background")}
              active={bgEffect.mode !== "none"}
              accent={showBackgrounds}
              onClick={() => setShowBackgrounds(!showBackgrounds)}
            />
          </div>

          {/* Device selection — always visible when devices are available */}
          {permissionState === "granted" && (audioDevices.length > 0 || videoDevices.length > 0) && (
            <div className="mx-6 mb-4 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-1.5 mb-3">
                <Settings2 size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
                <label className="text-[11px] font-medium text-white/40">{t("wave.deviceSettings")}</label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {audioDevices.length > 0 && (
                  <DarkSelect
                    label={t("wave.microphone")}
                    value={selectedAudioDevice || audioDevices[0]?.deviceId || ""}
                    options={audioDevices.map((d) => ({ value: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` }))}
                    onChange={setSelectedAudioDevice}
                  />
                )}
                {videoDevices.length > 0 && (
                  <DarkSelect
                    label={t("wave.camera")}
                    value={selectedVideoDevice || videoDevices[0]?.deviceId || ""}
                    options={videoDevices.map((d) => ({ value: d.deviceId, label: d.label || `Cam ${d.deviceId.slice(0, 8)}` }))}
                    onChange={setSelectedVideoDevice}
                  />
                )}
                <DarkSelect
                  label={t("wave.videoQuality")}
                  value={useWaveStore.getState().videoQuality}
                  options={[
                    { value: "low", label: "360p" },
                    { value: "medium", label: "540p" },
                    { value: "high", label: "720p" },
                    { value: "hd", label: "1080p" },
                  ]}
                  onChange={(v) => useWaveStore.getState().setVideoQuality(v as VideoQuality)}
                />
              </div>
            </div>
          )}

          {/* Background effects picker */}
          {showBackgrounds && (
            <div className="mx-6 mb-4 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <label className="text-[11px] font-medium text-white/40 block mb-2">{t("wave.background")}</label>
              {bgLoading && (
                <div className="text-xs text-white/30 mb-2">{t("wave.loadingBackground")}</div>
              )}
              <div className="grid grid-cols-5 gap-2">
                {/* None option */}
                <button
                  onClick={async () => {
                    setBgEffect({ mode: "none" });
                    bgProcessorRef.current?.stop();
                    bgProcessorRef.current = null;
                    // Restore original stream to video
                    if (videoRef.current && stream) videoRef.current.srcObject = stream;
                  }}
                  className="relative aspect-square rounded-lg overflow-hidden transition-all hover:scale-105"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.08)",
                    border: bgEffect.mode === "none" ? "2px solid #6366f1" : "2px solid transparent",
                  }}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <Ban size={16} style={{ color: "rgba(255,255,255,0.4)" }} />
                  </div>
                </button>

                {/* Virtual backgrounds */}
                {VIRTUAL_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={async () => {
                      if (!stream || !videoEnabled) return;
                      setBgLoading(true);

                      const effect: BackgroundEffect = bg.mode === "blur"
                        ? { mode: "blur", blurStrength: bg.blurStrength }
                        : { mode: "image", imageUrl: bg.preview };

                      setBgEffect(effect);

                      try {
                        // Create or reuse processor
                        if (!bgProcessorRef.current) {
                          bgProcessorRef.current = new BackgroundProcessor();
                        }
                        bgProcessorRef.current.setInput(stream);
                        bgProcessorRef.current.setEffect(effect);
                        const processedStream = await bgProcessorRef.current.start();

                        // Show processed stream in preview (keep audio from original)
                        if (videoRef.current) {
                          videoRef.current.srcObject = processedStream;
                        }
                      } catch (e) {
                        console.error("[Wave] Background effect failed:", e);
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

          </div>{/* end scrollable content */}

          {/* Start call button */}
          <div className="px-6 pb-6">
            <button
              onClick={handleStartCall}
              disabled={permissionState === "denied"}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "white",
                boxShadow: "0 4px 16px rgba(34, 197, 94, 0.3)",
              }}
            >
              <Phone size={18} />
              {t("wave.startCall")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

/** Premium toggle button for the lobby */
function LobbyToggle({
  icon,
  label,
  active,
  danger,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  danger?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  const bg = danger
    ? "rgba(239, 68, 68, 0.15)"
    : accent
      ? "rgba(59, 130, 246, 0.15)"
      : "rgba(255, 255, 255, 0.06)";
  const border = danger
    ? "rgba(239, 68, 68, 0.25)"
    : accent
      ? "rgba(59, 130, 246, 0.25)"
      : "rgba(255, 255, 255, 0.08)";
  const color = danger
    ? "#f87171"
    : accent
      ? "#60a5fa"
      : "rgba(255, 255, 255, 0.75)";

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        backdropFilter: "blur(8px)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

