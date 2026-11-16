import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_TZ, TZ_COOKIE, validTz } from "@/lib/zone";

/** The viewer's time zone, from the cookie their browser sets; the default zone when there isn't one yet (or outside a request). */
export async function viewerTz(): Promise<string> {
  try {
    return validTz((await cookies()).get(TZ_COOKIE)?.value) ?? DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}
