/** Unread count badge */

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
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full ${className}`}
      style={{
        backgroundColor: "var(--color-bg-accent)",
        color: "var(--color-text-inverse)",
      }}
    >
      {display}
    </span>
  );
});
