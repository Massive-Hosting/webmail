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
      }
    : {};

  return { position, handleProps, containerStyle };
}
