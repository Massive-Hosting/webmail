/** Incoming Wave call notification — premium animated card */

import React, { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useWaveStore } from "@/stores/wave-store.ts";
import { useWave } from "@/hooks/use-wave.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { useTranslation } from "react-i18next";

export const IncomingCallNotification = React.memo(function IncomingCallNotification() {
  const { t } = useTranslation();
  const incomingCall = useWaveStore((s) => s.incomingCall);
  const { acceptCall, rejectCall } = useWave();
  const audioRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);

  // Ring sound
  useEffect(() => {
    if (!incomingCall) {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.close();
        audioRef.current = null;
      }
      return;
    }

    // Create a pleasant two-tone ring (like a real phone)
    try {
      const ctx = new AudioContext();
      audioRef.current = ctx;

      // Two-tone ring: 440Hz + 480Hz (North American ring cadence)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.value = 440;
      osc2.type = "sine";
      osc2.frequency.value = 480;
      gain.gain.value = 0;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      oscillatorRef.current = osc1;

      // Ring cadence: 2s on, 4s off (standard ring pattern)
      const scheduleRing = () => {
        const now = ctx.currentTime;
        // Fade in
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        // Hold
        gain.gain.setValueAtTime(0.08, now + 0.9);
        // Brief gap in the middle
        gain.gain.linearRampToValueAtTime(0, now + 0.95);
        gain.gain.setValueAtTime(0, now + 1.0);
        gain.gain.linearRampToValueAtTime(0.08, now + 1.05);
        // Fade out
        gain.gain.setValueAtTime(0.08, now + 1.9);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);
      };

      scheduleRing();
      const ringInterval = setInterval(scheduleRing, 4000);

      // Auto-reject after 30 seconds
      const timeout = setTimeout(() => {
        rejectCall();
      }, 30000);

      return () => {
        clearInterval(ringInterval);
        clearTimeout(timeout);
        osc1.stop();
        osc2.stop();
        ctx.close();
      };
    } catch {
      // Audio not available
    }
  }, [incomingCall, rejectCall]);

  if (!incomingCall) return null;

  const senderAddress = { name: incomingCall.callerName, email: incomingCall.from };

  return (
    <div
      className="fixed top-6 right-6 z-[9999] animate-slide-in-right"
      style={{ width: 340 }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-primary)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(59, 130, 246, 0.1)",
        }}
      >
        {/* Gradient header */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
          }}
        >
          <div className="relative">
            <Avatar address={senderAddress} size={48} />
            {/* Pulsing ring indicator */}
            <div
              className="absolute -inset-1 rounded-full"
              style={{
                border: "2px solid rgba(255, 255, 255, 0.4)",
                animation: "wave-pulse 2s ease-in-out infinite",
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-sm truncate">
              {incomingCall.from}
            </div>
            <div className="text-white/60 text-xs truncate">
              {incomingCall.video ? t("wave.incomingVideoCall") : t("wave.incomingAudioCall")}
            </div>
          </div>
          {incomingCall.video && (
            <Video size={20} style={{ color: "rgba(255, 255, 255, 0.7)", flexShrink: 0 }} />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 px-5 py-4">
          <button
            onClick={rejectCall}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <PhoneOff size={16} />
            {t("wave.decline")}
          </button>
          <button
            onClick={acceptCall}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              color: "white",
              boxShadow: "0 2px 8px rgba(34, 197, 94, 0.3)",
            }}
          >
            <Phone size={16} />
            {t("wave.accept")}
          </button>
        </div>
      </div>
    </div>
  );
});
