"use client";

import { useState, useTransition } from "react";
import { toggleLike } from "@/lib/marketplace/like-actions";
import { cn } from "@/lib/utils";

/** Compact count: 999, 1.2k, 12k. */
export const formatLikes = (n: number) => (n < 1000 ? String(n) : n < 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(n / 1000)}k`);

/**
 * A heart with the persona's public count. Anyone can tap it, signed in or not; the count updates at once and is
 * corrected by the server's answer. Sits on top of a card image (variant "overlay") or in a row of buttons ("solid").
 */
export function HeartButton({
  listingId,
  name,
  initialLikes,
  initialLiked,
  variant = "overlay",
  className,
}: {
  listingId: string;
  name: string;
  initialLikes: number;
  initialLiked: boolean;
  variant?: "overlay" | "solid";
  className?: string;
}) {
  const [state, setState] = useState({ likes: initialLikes, liked: initialLiked });
  const [pop, setPop] = useState(0);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  function tap(e: React.MouseEvent) {
    // On a card the heart sits inside the link to her page: hearting must not open it.
    e.preventDefault();
    e.stopPropagation();
    const before = state;
    const next = { liked: !before.liked, likes: Math.max(0, before.likes + (before.liked ? -1 : 1)) };
    setState(next);
    if (next.liked) setPop((p) => p + 1);
    setError(undefined);
    start(async () => {
      const r = await toggleLike(listingId);
      if (r.ok) setState({ liked: r.liked, likes: r.likes });
      else {
        setState(before);
        setError(r.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={tap}
      aria-pressed={state.liked}
      aria-label={`${state.liked ? "Remove your heart from" : "Heart"} ${name}. ${state.likes} ${state.likes === 1 ? "heart" : "hearts"}.`}
      title={error}
      className={cn(
        "group/heart inline-flex items-center gap-1.5 rounded-full font-semibold tabular-nums transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        variant === "overlay"
          ? "h-8 bg-black/45 px-2.5 text-xs text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-black/60"
          : "h-11 min-w-11 justify-center border border-neutral-700 bg-neutral-900 px-3.5 text-sm text-neutral-100 hover:border-neutral-500",
        error && "ring-amber-400/70",
        className,
      )}
    >
      <svg
        key={pop}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn(
          "h-4 w-4 transition-colors",
          variant === "solid" && "h-[18px] w-[18px]",
          state.liked ? "fill-brand-500 stroke-brand-500" : "fill-none stroke-current group-hover/heart:stroke-brand-300",
          pop > 0 && state.liked && "animate-[heart-pop_0.45s_cubic-bezier(.2,.9,.3,1.4)]",
        )}
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 5.5 3.6 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" />
      </svg>
      <span>{formatLikes(state.likes)}</span>
    </button>
  );
}
