/**
 * Scrolls the page so `el` sits near the top, over `ms` milliseconds. It stops the moment the person touches the
 * screen, scrolls or presses a key, and does nothing at all when they prefer reduced motion. Returns a cancel function.
 */
export function glideTo(el: Element, ms = 1000, offset = 88): () => void {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const from = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const to = Math.max(0, Math.min(max, from + el.getBoundingClientRect().top - offset));
  if (Math.abs(to - from) < 8) return () => {};
  let raf = 0;
  const start = performance.now();
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const events = ["touchstart", "wheel", "pointerdown", "keydown"] as const;
  const cancel = () => {
    cancelAnimationFrame(raf);
    for (const e of events) window.removeEventListener(e, cancel);
  };
  for (const e of events) window.addEventListener(e, cancel, { passive: true });
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    window.scrollTo(0, from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else cancel();
  };
  raf = requestAnimationFrame(step);
  return cancel;
}
