/** Hook to make a fixed-position element draggable by its handle */

import { useState, useCallback, useRef } from "react";

interface DragPosition {
  x: number;
  y: number;
}

export function useDraggable(initialPosition?: DragPosition) {
  const [position, setPosition] = useState<DragPosition | null>(initialPosition ?? null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag from the handle element itself, not its children buttons
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, [role='button']")) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const el = (e.currentTarget as HTMLElement).closest("[data-draggable]") as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const newX = dragRef.current.origX + dx;
    const newY = dragRef.current.origY + dy;

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
        transform: "none",  // Override any centering transform
      }
    : {};

  return { position, handleProps, containerStyle };
}
