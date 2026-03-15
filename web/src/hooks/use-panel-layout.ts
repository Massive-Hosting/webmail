/** Panel resize drag hook */

import { useCallback, useRef } from "react";

interface UseResizeOptions {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}

export function useResize({ direction, onResize, onResizeEnd }: UseResizeOptions) {
  const startPos = useRef(0);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      isDragging.current = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const currentPos =
          direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos.current;
        startPos.current = currentPos;
        onResize(delta);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onResizeEnd?.();
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, onResize, onResizeEnd],
  );

  return { handleMouseDown };
}
