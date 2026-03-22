/** Dark-themed custom dropdown for device selection in Wave lobby/guest pages */

import React, { useState, useEffect, useRef } from "react";
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
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <label className="text-[11px] font-medium text-white/40 block mb-1">{label}</label>
      <button
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
      {open && (
        <div
          className="absolute z-[10000] left-0 right-0 mt-1 py-1 rounded-lg overflow-y-auto animate-scale-in"
          style={{
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
              onClick={() => { onChange(opt.value); setOpen(false); }}
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
        </div>
      )}
    </div>
  );
});
