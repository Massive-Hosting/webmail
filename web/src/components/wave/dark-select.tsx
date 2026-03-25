/** Dark-themed dropdown for device selection in Wave lobby/guest pages.
 *  Uses a native <select> element for reliable interaction inside Radix dialogs. */

import React from "react";
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
  return (
    <div>
      <label className="text-[11px] font-medium text-white/40 block mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 pl-3 pr-8 text-xs rounded-lg outline-none cursor-pointer appearance-none transition-colors"
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ backgroundColor: "#1c1917", color: "white" }}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "rgba(255,255,255,0.4)" }}
        />
      </div>
    </div>
  );
});
