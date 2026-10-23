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
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-emerald-700 bg-emerald-950 px-4 py-2 text-sm text-emerald-100 shadow-lg"
    >
      {message}
    </div>
  ) : null;

  return { toast, show };
}
