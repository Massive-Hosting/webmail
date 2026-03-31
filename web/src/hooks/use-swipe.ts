/** Touch swipe gesture hook for mobile */

import { useRef, useCallback, useEffect, useState } from "react";

interface SwipeOptions {
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enabled?: boolean;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  offset: number;
  swiping: boolean;
}

export function useSwipe({
  threshold = 80,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: SwipeOptions): SwipeHandlers {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffsetRef = useRef(0);
  const isSwipingRef = useRef(false);
  const isScrolling = useRef(false);
  const callbackRef = useRef({ onSwipeLeft, onSwipeRight });
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    callbackRef.current = { onSwipeLeft, onSwipeRight };
  }, [onSwipeLeft, onSwipeRight]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      currentOffsetRef.current = 0;
      isSwipingRef.current = false;
      isScrolling.current = false;
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || isScrolling.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      // Determine intent: horizontal swipe vs vertical scroll
      if (!isSwipingRef.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        isScrolling.current = true;
        return;
      }

      if (Math.abs(dx) > 10) {
        isSwipingRef.current = true;
        setIsSwiping(true);
      }

      if (isSwipingRef.current) {
        // Resist past threshold with rubber-band effect
        const maxOffset = threshold * 1.5;
        const clamped = Math.max(-maxOffset, Math.min(maxOffset, dx));
        currentOffsetRef.current = clamped;
        setCurrentOffset(clamped);
        // Update the element transform via the parent
        const el = (e.currentTarget as HTMLElement).querySelector(
          ".swipe-container__content",
        ) as HTMLElement | null;
        if (el) {
          el.classList.add("swipe-container__content--swiping");
          el.style.transform = `translateX(${clamped}px)`;
        }
      }
    },
    [enabled, threshold],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled || !isSwipingRef.current) return;
    const offset = currentOffsetRef.current;

    if (offset < -threshold && callbackRef.current.onSwipeLeft) {
      callbackRef.current.onSwipeLeft();
    } else if (offset > threshold && callbackRef.current.onSwipeRight) {
      callbackRef.current.onSwipeRight();
    }

    // Reset
    currentOffsetRef.current = 0;
    isSwipingRef.current = false;
    isScrolling.current = false;
    setCurrentOffset(0);
    setIsSwiping(false);
  }, [enabled, threshold]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    offset: currentOffset,
    swiping: isSwiping,
  };
}
