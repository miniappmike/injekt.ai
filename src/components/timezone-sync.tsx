"use client";

import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/zone";

/** Tells the server which time zone this browser is in (a cookie), so "today" and "this month" follow the viewer's clock. */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !document.cookie.split("; ").includes(`${TZ_COOKIE}=${tz}`)) {
        document.cookie = `${TZ_COOKIE}=${tz}; path=/; max-age=31536000; samesite=lax`;
      }
    } catch {
      // The server keeps using its default zone.
    }
  }, []);
  return null;
}
