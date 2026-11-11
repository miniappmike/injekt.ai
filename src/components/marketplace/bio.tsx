"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Her bio, cut to two lines with an inline "View more" at the end of the second line. */
export function Bio({ text }: { text: string }) {
  const p = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);

  useLayoutEffect(() => {
    const el = p.current;
    if (!el) return;
    const measure = () => {
      if (!open) setTall(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  const toggle = "font-semibold text-neutral-50 underline decoration-neutral-600 underline-offset-4 hover:decoration-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded";
  return (
    <div className="relative text-[15px] leading-relaxed text-neutral-300">
      <p ref={p} className={open ? "whitespace-pre-line" : "line-clamp-2"}>
        {text}
        {open && (
          <>
            {" "}
            <button type="button" className={toggle} aria-expanded onClick={() => setOpen(false)}>
              View less
            </button>
          </>
        )}
      </p>
      {!open && tall && (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className={`${toggle} absolute right-0 bottom-0 bg-neutral-950 pl-6 shadow-[-1.2rem_0_1rem_-0.2rem_var(--color-neutral-950)]`}
        >
          View more
        </button>
      )}
    </div>
  );
}
