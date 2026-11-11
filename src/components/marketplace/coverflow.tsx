"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CARD_VARS } from "@/components/marketplace/market-card";
import { ChevronIcon } from "@/components/icons";
import { canLoop, coverflowLook, loopCopies, loopHome, loopShift, nearestIndex, nearestSlot, wrapIndex } from "@/lib/marketplace/view";

/** What a parent can ask the carousel to do. Card numbers are positions in the list; going past either end wraps round. */
export interface CoverflowApi {
  scrollToIndex: (i: number) => void;
}

/**
 * A sideways scroll-snap track of cards where the centred one is big and the neighbours peek in smaller and dimmer.
 * On every scroll frame each card's size, fade and darkness are set from how far it is from the centre, so a half-made
 * swipe looks half-way between the two states. Only transform and opacity change, which keeps it smooth.
 *
 * With three or more cards it loops: the list is drawn three (or five) times in a row and the view always rests in the
 * middle copy. When a scroll settles anywhere else, the track silently jumps by whole copies, which looks identical,
 * so there is never an edge to hit. One or two cards are simply centred and don't loop.
 */
export function Coverflow({
  count,
  render,
  onActive,
  api,
  label,
}: {
  count: number;
  /** Draws card `index`. `primary` is true for the middle copy only (the one that owns ids and page transitions). */
  render: (index: number, primary: boolean) => React.ReactNode;
  /** Called with the centred card's number within the list (0 to count - 1). */
  onActive?: (i: number) => void;
  api?: React.Ref<CoverflowApi>;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const frame = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touching = useRef(false);
  const lastPitch = useRef(0);
  const looping = canLoop(count);
  const copies = loopCopies(count);
  const total = count * copies;
  // Slot number (across all copies) now in the centre.
  const slot = useRef(loopHome(count));
  const lastActive = useRef(-1);

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
    slots.current.forEach((s) => {
      if (!s) return;
      const d = p > 0 ? (s.offsetLeft + s.offsetWidth / 2 - centre) / p : 0;
      // Cards far off screen keep their last (smallest) look; no need to restyle them every frame.
      if (Math.abs(d) > 3 && s.dataset.far) return;
      const look = coverflowLook(d);
      s.style.transform = `scale(${look.scale.toFixed(4)})`;
      s.style.opacity = look.opacity.toFixed(3);
      s.style.setProperty("--dim", look.dim.toFixed(3));
      if (Math.abs(d) > 3) s.dataset.far = "1";
      else delete s.dataset.far;
    });
    const at = nearestIndex(el.scrollLeft, p, total);
    slot.current = at;
    const logical = wrapIndex(at, count);
    if (logical !== lastActive.current) {
      lastActive.current = logical;
      onActive?.(logical);
    }
  }, [count, onActive, pitch, total]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  }, [apply]);

  // Jump back to the middle copy once the track has stopped moving (and no finger is on it).
  const recentre = useCallback(() => {
    const el = track.current;
    if (!el || !looping || touching.current) return;
    const p = pitch();
    const shift = loopShift(nearestIndex(el.scrollLeft, p, total), count);
    if (shift !== 0) {
      el.scrollLeft += shift * p;
      apply();
    }
  }, [apply, count, looping, pitch, total]);

  const onScroll = useCallback(() => {
    schedule();
    clearTimeout(settle.current);
    settle.current = setTimeout(recentre, 140);
  }, [recentre, schedule]);

  // Start in the middle copy, before the first paint, so the first card is centred with neighbours on both sides.
  useLayoutEffect(() => {
    const el = track.current;
    if (el) {
      lastPitch.current = pitch();
      el.scrollLeft = loopHome(count) * lastPitch.current;
    }
    apply();
  }, [apply, count, pitch]);

  useEffect(() => {
    const el = track.current;
    // When the screen is resized the cards change width: keep the same card centred.
    const ro = new ResizeObserver(() => {
      const p = pitch();
      if (el && lastPitch.current > 0 && p > 0 && p !== lastPitch.current) el.scrollLeft = (el.scrollLeft / lastPitch.current) * p;
      lastPitch.current = p;
      schedule();
    });
    if (el) ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      clearTimeout(settle.current);
    };
  }, [pitch, schedule]);

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el || count === 0) return;
      const to = looping ? nearestSlot(i, slot.current, count) : Math.min(count - 1, Math.max(0, i));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: to * pitch(), behavior: reduce ? "auto" : "smooth" });
    },
    [count, looping, pitch],
  );
  useImperativeHandle(api, () => ({ scrollToIndex }), [scrollToIndex]);

  // Arrows and keys move one slot from wherever the centre is (so they follow a half-finished swipe too).
  const step = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const to = nearestIndex(el.scrollLeft, pitch(), total) + dir;
    if (to < 0 || to > total - 1) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: to * pitch(), behavior: reduce ? "auto" : "smooth" });
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Home") scrollToIndex(0);
    else if (e.key === "End") scrollToIndex(count - 1);
    else return;
    e.preventDefault();
  }

  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      aria-label={dir === -1 ? "Previous persona" : "Next persona"}
      onClick={() => step(dir)}
      className={cn(
        "absolute top-1/2 z-30 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/90 text-white shadow-xl backdrop-blur transition-all hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70 active:scale-90 sm:flex",
        dir === -1 ? "left-3 lg:left-6" : "right-3 lg:right-6",
      )}
    >
      <ChevronIcon className={cn("h-5 w-5", dir === -1 && "rotate-180")} />
    </button>
  );

  // Two cards on a big screen sit side by side in the middle with nothing to scroll.
  const pair = count === 2;
  return (
    <div className={cn("relative -mx-4 sm:-mx-6", CARD_VARS)}>
      {count > 1 && !pair && arrow(-1)}
      {count > 1 && !pair && arrow(1)}
      <div
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onTouchStart={() => (touching.current = true)}
        onTouchEnd={() => {
          touching.current = false;
          clearTimeout(settle.current);
          settle.current = setTimeout(recentre, 140);
        }}
        onTouchCancel={() => (touching.current = false)}
        className={cn(
          "no-scrollbar relative flex snap-x snap-mandatory items-start gap-0 overflow-x-auto sm:[mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] overflow-y-hidden px-[calc((100%-var(--card-w))/2)] py-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:py-3",
          pair && "sm:justify-center sm:px-0",
        )}
      >
        {Array.from({ length: total }, (_, s) => {
          const i = s % count;
          const primary = Math.floor(s / count) === Math.floor(copies / 2);
          return (
            <div
              key={s}
              ref={(el) => {
                slots.current[s] = el;
              }}
              data-clone={primary ? undefined : ""}
              className="relative shrink-0 snap-center will-change-transform"
              style={{ transformOrigin: "50% 50%" }}
            >
              {render(i, primary)}
              {/* The darkening veil on side cards, driven by --dim. Clicks pass through it. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[3/4.4] rounded-[2rem] bg-neutral-950" style={{ opacity: "var(--dim, 0)" }} aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
