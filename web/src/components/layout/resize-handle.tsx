/** Draggable resize handle between panes */

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
      className="relative w-[3px] shrink-0 cursor-col-resize group"
      style={{ backgroundColor: "var(--color-border-secondary)" }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[var(--color-border-focus)] group-hover:opacity-30 transition-opacity duration-150"
      />
    </div>
  );
});
