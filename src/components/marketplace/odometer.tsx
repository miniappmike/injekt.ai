"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A big number whose digits roll up like an odometer the first time it scrolls into view. Each digit is a tall strip
 * of 0-9 slid into place; later digits start a beat after earlier ones. People who prefer less motion see the final
 * number straight away.
 */
export function Odometer({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(false);
  const digits = String(Math.max(0, Math.floor(value))).split("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOn(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} role="text" aria-label={String(value)} className={cn("inline-flex leading-none tabular-nums", className)}>
      {digits.map((d, i) => (
        <span key={i} aria-hidden="true" className="relative inline-block h-[1em] overflow-hidden">
          {/* Invisible copy holds the width of the digit. */}
          <span className="invisible block h-[1em]">{d}</span>
          <span
            className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `translateY(${on ? -Number(d) * 10 : 0}%)`, transitionDelay: `${i * 140}ms` }}
          >
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n} className="block h-[1em] text-center">
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
