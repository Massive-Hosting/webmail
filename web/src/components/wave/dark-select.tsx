/** Dark-themed custom dropdown for device selection in Wave lobby/guest pages */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

interface DarkSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export const DarkSelect = React.memo(function DarkSelect({
  label,
  value,
  options,
  onChange,
}: DarkSelectProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Position the dropdown relative to the button using a portal
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(options.length * 32 + 8, 180);
    // Open upward if not enough space below
    const openUp = spaceBelow < dropdownHeight + 8;
    setPos({
      top: openUp ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [options.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, updatePosition]);

  return (
    <div>
      <label className="text-[11px] font-medium text-white/40 block mb-1">{label}</label>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between h-9 px-3 text-xs rounded-lg outline-none cursor-pointer transition-colors"
        style={{
          backgroundColor: open ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.85)",
          border: open ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <span className="truncate">{selected?.label || "Select..."}</span>
        <ChevronDown size={14} className="shrink-0 ml-2" style={{
          color: "rgba(255,255,255,0.4)",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 150ms ease",
        }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed py-1 rounded-lg overflow-y-auto animate-scale-in"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
            backgroundColor: "#1c1917",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            maxHeight: 180,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
              style={{
                color: opt.value === value ? "white" : "rgba(255,255,255,0.7)",
                backgroundColor: opt.value === value ? "rgba(255,255,255,0.08)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {opt.value === value && (
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }} />
              )}
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
});
