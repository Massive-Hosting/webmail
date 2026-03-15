/** Unread count badge — refined blue pill */

import React from "react";

interface BadgeProps {
  count: number;
  className?: string;
}

export const Badge = React.memo(function Badge({ count, className = "" }: BadgeProps) {
  if (count <= 0) return null;

  const display = count > 999 ? "999+" : String(count);

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[11px] font-semibold leading-none rounded-full ${className}`}
      style={{
        backgroundColor: "var(--color-bg-accent)",
        color: "var(--color-text-inverse)",
        letterSpacing: "0.01em",
      }}
    >
      {display}
    </span>
  );
});
