/** Hook to make a fixed-position element draggable by its handle */

import { useState, useCallback, useRef } from "react";

interface DragPosition {
  x: number;
  y: number;
}

export function useDraggable(initialPosition?: DragPosition) {
  const [position, setPosition] = useState<DragPosition | null>(initialPosition ?? null);
  const dragRef = useRef<{
    // Offset from pointer to element's top-left corner
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, [role='button']")) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const el = (e.currentTarget as HTMLElement).closest("[data-draggable]") as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    // Store the offset between the pointer position and the element's top-left.
    // This keeps the grab point stable — the element doesn't jump.
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };

    // Immediately set position to current visual location (removes centering transform)
    setPosition({ x: rect.left, y: rect.top });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;

    const newX = e.clientX - dragRef.current.offsetX;
    const newY = e.clientY - dragRef.current.offsetY;

    // Clamp to viewport
    const maxX = window.innerWidth - 100;
    const maxY = window.innerHeight - 50;
    setPosition({
      x: Math.max(0, Math.min(maxX, newX)),
      y: Math.max(0, Math.min(maxY, newY)),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    style: { cursor: "grab", touchAction: "none" } as React.CSSProperties,
  };

  const containerStyle: React.CSSProperties = position
    ? {
        left: position.x,
        top: position.y,
        transform: "none",
        translate: "none",
      } as React.CSSProperties
    : {};

  return { position, handleProps, containerStyle };
}

/** Hook to make a fixed-position element resizable via a corner handle.
 *  Maintains 4:3 aspect ratio. */
export function useResizable(initialSize?: { width: number; height: number }) {
  const [size, setSize] = useState(initialSize ?? { width: 240, height: 180 });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height };
  }, [size]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    // Use the larger delta to maintain aspect ratio
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy * (4 / 3);
    const newW = Math.max(120, Math.min(600, resizeRef.current.startW + delta));
    const newH = newW * 0.75; // 4:3 aspect
    setSize({ width: newW, height: newH });
  }, []);

  const onPointerUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  const resizeHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    style: {
      position: "absolute" as const,
      bottom: 0,
      right: 0,
      width: 16,
      height: 16,
      cursor: "nwse-resize",
      touchAction: "none" as const,
      zIndex: 20,
    },
  };

  return { size, resizeHandleProps };
}
