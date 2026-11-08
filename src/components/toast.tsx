"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Small confirmation message that fades away on its own. Announced to screen readers via role="status".
export function useToast(durationMs = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  const toast = message ? (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex max-sm:bottom-24 -translate-x-1/2 animate-[toast-in_0.25s_cubic-bezier(.2,.9,.3,1.2)_both] items-center gap-2 rounded-full border border-emerald-500/30 bg-neutral-900/95 px-4 py-2 text-sm font-medium text-emerald-100 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl before:h-2 before:w-2 before:rounded-full before:bg-emerald-400 before:shadow-[0_0_8px_rgb(52_211_153)] before:content-['']"
    >
      {message}
    </div>
  ) : null;

  return { toast, show };
}
