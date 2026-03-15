/** Draggable resize handle between panes — premium design */

import React from "react";
import { useResize } from "@/hooks/use-panel-layout.ts";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  onDoubleClick?: () => void;
}

export const ResizeHandle = React.memo(function ResizeHandle({
  onResize,
  onDoubleClick,
}: ResizeHandleProps) {
  const { handleMouseDown } = useResize({
    direction: "horizontal",
    onResize,
  });

  return (
    <div
      className="relative w-px shrink-0 cursor-col-resize group"
      style={{ backgroundColor: "var(--color-border-primary)" }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Wider invisible hit target + hover indicator */}
      <div
        className="absolute inset-y-0 -left-[3px] -right-[3px] transition-all duration-200 group-hover:bg-[var(--color-border-focus)] group-hover:opacity-40 group-active:opacity-60"
        style={{ borderRadius: "1px" }}
      />
    </div>
  );
});
