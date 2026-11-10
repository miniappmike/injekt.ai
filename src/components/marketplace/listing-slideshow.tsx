"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronIcon } from "@/components/icons";
import { slideStep } from "@/lib/marketplace/view";

/**
 * A swipeable picture slideshow used on cards and on the persona page.
 * - Only the current, previous and next pictures are in the page, and all but the first are lazy-loaded.
 * - It claims sideways swipes (touch-action: pan-y) and moves the pictures itself. Swiping past either end calls
 *   `onEdge`, so a card can hand the swipe on to the carousel around it.
 * - A tap or click that isn't a swipe calls `onTap` (the card uses it to open the persona).
 * - Arrows, dots and the arrow keys all work; the arrows and dots never trigger the card's link.
 */
export function ListingSlideshow({
  images,
  name,
  variant = "card",
  onEdge,
  onTap,
  eager = false,
  className,
}: {
  images: { id: string; url: string }[];
  name: string;
  variant?: "card" | "hero";
  onEdge?: (dir: -1 | 1) => void;
  onTap?: () => void;
  /** Load the first picture straight away (the one at the top of the screen). */
  eager?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; id: number; claimed: boolean; moved: number } | null>(null);
  const many = images.length > 1;

  function go(dir: -1 | 1) {
    const step = slideStep(index, dir, images.length);
    setIndex(step.index);
    if (step.edge) onEdge?.(step.edge);
  }

  function down(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, claimed: false, moved: 0 };
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    g.moved = Math.max(g.moved, Math.abs(dx), Math.abs(dy));
    if (!many) return;
    if (!g.claimed && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      g.claimed = true;
      box.current?.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (g.claimed) {
      // Pulling past the first or last picture is stiffer, so it's clear you're at the end.
      const atEdge = (index === 0 && dx > 0) || (index === images.length - 1 && dx < 0);
      setDragX(atEdge ? dx * 0.35 : dx);
    }
  }
  function up(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    setDragging(false);
    setDragX(0);
    if (g.claimed) {
      const width = box.current?.clientWidth ?? 300;
      if (Math.abs(dx) > Math.min(60, width * 0.16)) go(dx < 0 ? 1 : -1);
    } else if (g.moved < 6) {
      onTap?.();
    }
  }
  function cancel() {
    gesture.current = null;
    setDragging(false);
    setDragX(0);
  }
  function key(e: React.KeyboardEvent) {
    if (!many || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    // Handled here, so the carousel around a card doesn't also move.
    e.preventDefault();
    e.stopPropagation();
    go(e.key === "ArrowRight" ? 1 : -1);
  }

  const hero = variant === "hero";
  const visible = images.map((img, i) => ({ img, i })).filter(({ i }) => Math.abs(i - index) <= 1);

  return (
    <div className={cn("group/show absolute inset-0", className)}>
      <div
        ref={box}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${name} preview photos`}
        tabIndex={many ? 0 : -1}
        onKeyDown={key}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        className={cn(
          "absolute inset-0 overflow-hidden outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70",
          // With one picture there is nothing to swipe, so the page and the carousel keep their own scrolling.
          many ? "touch-pan-y" : "touch-manipulation",
          onTap && "cursor-pointer",
        )}
      >
        {images.length === 0 && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 font-poster text-8xl text-neutral-600" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        {visible.map(({ img, i }) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage links, not optimisable by next/image
          <img
            key={img.id}
            src={img.url}
            alt={`${name} preview ${i + 1}`}
            aria-hidden={i !== index || undefined}
            loading={i === 0 && eager ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            className={cn("absolute inset-0 h-full w-full object-cover", !dragging && "transition-transform duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]")}
            style={{ transform: `translate3d(calc(${(i - index) * 100}% + ${dragX}px), 0, 0)` }}
          />
        ))}
      </div>

      {many && (
        <>
          <p className="sr-only" aria-live="polite">
            Photo {index + 1} of {images.length}
          </p>
          {(["prev", "next"] as const).map((side) => {
            const dir = side === "prev" ? -1 : 1;
            const disabled = side === "prev" ? index === 0 : index === images.length - 1;
            return (
              <button
                key={side}
                type="button"
                aria-label={`${side === "prev" ? "Previous" : "Next"} photo of ${name}`}
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  go(dir);
                }}
                className={cn(
                  "absolute top-1/2 z-20 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition-all hover:bg-black/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:scale-90 disabled:pointer-events-none disabled:opacity-0",
                  hero ? "h-10 w-10" : "h-7 w-7 sm:h-9 sm:w-9",
                  side === "prev" ? "left-2 sm:left-3" : "right-2 sm:right-3",
                  // On a mouse device the arrows appear on hover; on a phone they're small and always there.
                  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/show:opacity-100 [@media(hover:hover)]:group-focus-within/show:opacity-100",
                )}
              >
                <ChevronIcon className={cn("h-4 w-4", side === "prev" && "rotate-180")} />
              </button>
            );
          })}
          <div className={cn("absolute inset-x-0 z-20 flex justify-center gap-1.5 px-10", hero ? "-bottom-7" : "top-2.5")} role="tablist" aria-label="Choose photo">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Show photo ${i + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIndex(i);
                }}
                // A roomy tap area around a small visible dot.
                className="group/dot -my-2 flex h-6 items-center px-0.5 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-300 group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-white",
                    i === index ? "w-5 bg-white" : "w-1.5 bg-white/45 group-hover/dot:bg-white/80",
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
