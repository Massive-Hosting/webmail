/** AI Response Card — displays streaming AI results (summary, custom queries) */

import React from "react";
import { Sparkles, X } from "lucide-react";

interface AIResponseCardProps {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

export const AIResponseCard = React.memo(function AIResponseCard({
  title,
  icon,
  onClose,
  children,
}: AIResponseCardProps) {
  return (
    <div className="ai-response-card">
      <div className="ai-response-card__header">
        <span className="ai-response-card__title">
          {icon ?? <Sparkles size={14} />}
          {title}
        </span>
        <button
          type="button"
          className="ai-response-card__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
      <div className="ai-response-card__body">
        {children}
      </div>
    </div>
  );
});
