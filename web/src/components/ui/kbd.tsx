/** Keyboard shortcut display */

import React from "react";

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export const Kbd = React.memo(function Kbd({ children, className = "" }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[11px] font-mono font-medium rounded ${className}`}
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-border-primary)",
      }}
    >
      {children}
    </kbd>
  );
});
