"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

/** How far a sheet must be pulled down before letting go closes it. */
const CLOSE_AFTER_PX = 90;

/**
 * Pull a bottom sheet down by its grab bar to close it, the way sheets work on a phone. Spread `handle` on the grab
 * bar and put `style` on the sheet: it follows the finger, closes if let go far enough down, and springs back if not.
 * It moves with `translate`, which is separate from `transform`, so the sheet's slide-up animation doesn't fight it.
 */
export function useSheetDrag(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const end = (close: boolean) => {
    start.current = null;
    setDy(0);
    if (close) onClose();
  };
  const handle = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      start.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (start.current !== null) setDy(Math.max(0, e.clientY - start.current));
    },
    onPointerUp: () => end(dy > CLOSE_AFTER_PX),
    onPointerCancel: () => end(false),
    // The bar itself never scrolls the page or the sheet; it only drags.
    style: { touchAction: "none" } as CSSProperties,
  };
  const style: CSSProperties = dy ? { translate: `0 ${dy}px`, transition: "none" } : { transition: "translate 0.2s ease-out" };
  return { handle, style };
}
