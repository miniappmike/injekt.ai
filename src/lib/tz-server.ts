import "server-only";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { DEFAULT_TZ, TZ_COOKIE, validTz } from "@/lib/zone";

/** The viewer's time zone, from the cookie their browser sets; the default zone when there isn't one yet (or outside a request). */
export async function viewerTz(): Promise<string> {
  try {
    return validTz((await cookies()).get(TZ_COOKIE)?.value) ?? DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/**
 * The zone a person's daily limits count in: the one saved on their profile, which is fixed once set. The first time
 * there isn't one, the browser's zone (from the cookie) is saved; with no cookie yet the default is used and nothing is saved.
 * (Before migration 0032 there is no column, so this is just the cookie's zone.)
 */
export async function accountTz(userId: string): Promise<string> {
  const db = adminClient();
  const { data } = await db.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const saved = validTz((data as { timezone?: string | null } | null)?.timezone);
  if (saved) return saved;
  const seen = validTz((await cookies().catch(() => null))?.get(TZ_COOKIE)?.value);
  if (!seen) return DEFAULT_TZ;
  await db.from("profiles").update({ timezone: seen }).eq("id", userId).is("timezone", null);
  return seen;
}
