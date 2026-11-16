"use client";

import { useEffect, useState } from "react";

/**
 * A date or time in the viewer's own time zone and language. The server doesn't know where the viewer is (it runs in
 * UTC), so the first paint is in UTC for everyone and matches what the server sent; it switches to the viewer's
 * clock right after the page loads.
 */
export function LocalTime({ iso, o, fallback = "—" }: { iso: string | null | undefined; o: Intl.DateTimeFormatOptions; fallback?: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  if (!iso) return <>{fallback}</>;
  const text = new Date(iso).toLocaleString(local ? undefined : "en-US", local ? o : { ...o, timeZone: "UTC" });
  return <time dateTime={iso}>{text}</time>;
}
