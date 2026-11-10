"use client";

import { Children, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CARD_VARS } from "@/components/marketplace/market-card";
import { ChevronIcon } from "@/components/icons";
import { coverflowLook, nearestIndex } from "@/lib/marketplace/view";

/** What a parent can ask the carousel to do. */
export interface CoverflowApi {
  scrollToIndex: (i: number) => void;
}

/**
 * A sideways scroll-snap track of cards where the centred one is big and the neighbours peek in smaller and dimmer.
 * On every scroll frame each card's size, fade and darkness are set from how far it is from the centre, so a half-made
 * swipe looks half-way between the two states. Only transform and opacity change, which keeps it smooth.
 */
export function Coverflow({
  children,
  onActive,
  api,
  label,
}: {
  children: React.ReactNode;
  onActive?: (i: number) => void;
  api?: React.Ref<CoverflowApi>;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const frame = useRef(0);
  const count = Children.count(children);
  const [active, setActive] = useState(0);
  const lastActive = useRef(0);

  const pitch = useCallback(() => {
    const [a, b] = slots.current;
    return a && b ? b.offsetLeft - a.offsetLeft : (a?.offsetWidth ?? 0);
  }, []);

  const apply = useCallback(() => {
    frame.current = 0;
    const el = track.current;
    if (!el) return;
    const p = pitch();
    const centre = el.scrollLeft + el.clientWidth / 2;
    slots.current.forEach((slot) => {
      if (!slot) return;
      const d = p > 0 ? (slot.offsetLeft + slot.offsetWidth / 2 - centre) / p : 0;
      const look = coverflowLook(d);
      slot.style.transform = `scale(${look.scale.toFixed(4)})`;
      slot.style.opacity = look.opacity.toFixed(3);
      slot.style.setProperty("--dim", look.dim.toFixed(3));
    });
    const i = nearestIndex(el.scrollLeft, p, count);
    if (i !== lastActive.current) {
      lastActive.current = i;
      setActive(i);
      onActive?.(i);
    }
  }, [count, onActive, pitch]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  }, [apply]);

  useEffect(() => {
    apply();
    const ro = new ResizeObserver(schedule);
    if (track.current) ro.observe(track.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [apply, schedule]);

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el || count === 0) return;
      const to = Math.min(count - 1, Math.max(0, i));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: to * pitch(), behavior: reduce ? "auto" : "smooth" });
    },
    [count, pitch],
  );
  useImperativeHandle(api, () => ({ scrollToIndex }), [scrollToIndex]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") scrollToIndex(active + 1);
    else if (e.key === "ArrowLeft") scrollToIndex(active - 1);
    else if (e.key === "Home") scrollToIndex(0);
    else if (e.key === "End") scrollToIndex(count - 1);
    else return;
    e.preventDefault();
  }

  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      aria-label={dir === -1 ? "Previous persona" : "Next persona"}
      disabled={dir === -1 ? active === 0 : active >= count - 1}
      onClick={() => scrollToIndex(active + dir)}
      className={cn(
        "absolute top-1/2 z-30 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/90 text-white shadow-xl backdrop-blur transition-all hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70 active:scale-90 disabled:pointer-events-none disabled:opacity-0 sm:flex",
        dir === -1 ? "left-3 lg:left-6" : "right-3 lg:right-6",
      )}
    >
      <ChevronIcon className={cn("h-5 w-5", dir === -1 && "rotate-180")} />
    </button>
  );

  return (
    <div className={cn("relative -mx-4 sm:-mx-6", CARD_VARS)}>
      {count > 1 && arrow(-1)}
      {count > 1 && arrow(1)}
      <div
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onScroll={schedule}
        onKeyDown={onKeyDown}
        className="no-scrollbar relative flex snap-x snap-mandatory items-start gap-0 overflow-x-auto sm:[mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] overflow-y-hidden px-[calc((100%-var(--card-w))/2)] py-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:py-3"
      >
        {Children.map(children, (child, i) => (
          <div
            ref={(el) => {
              slots.current[i] = el;
            }}
            className="relative shrink-0 snap-center will-change-transform"
            style={{ transformOrigin: "50% 50%" }}
          >
            {child}
            {/* The darkening veil on side cards, driven by --dim. Clicks pass through it. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[3/4.4] rounded-[2rem] bg-neutral-950" style={{ opacity: "var(--dim, 0)" }} aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}
