/** Empty state component with icon, text, and optional action button */

import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState = React.memo(function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center animate-fade-in ${className}`}
    >
      <div
        className="mb-4"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {icon ?? <Inbox size={48} strokeWidth={1.5} />}
      </div>
      <h3
        className="text-lg font-medium mb-1"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm max-w-sm mb-3"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
          style={{
            backgroundColor: "var(--color-bg-accent)",
            color: "var(--color-text-inverse)",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
});
