import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createUserClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Hearts on marketplace personas. A signed-in heart counts once per account; a signed-out one once per browser, using
 * a random visitor id in a private cookie (it identifies nothing about the person and is only used for hearts).
 */

export const VISITOR_COOKIE = "ms_vid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LikeState {
  likes: number;
  liked: boolean;
}

/**
 * Who is hearting: "u:<user id>" when signed in, else "v:<visitor id>". With create, a signed-out browser gets a new
 * visitor id cookie (only possible in a server action or route); without it, a browser with no cookie is "nobody yet".
 */
export async function currentLiker({ create = false } = {}): Promise<string | null> {
  const {
    data: { user },
  } = await (await createUserClient()).auth.getUser();
  if (user) return `u:${user.id}`;
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing && UUID.test(existing)) return `v:${existing}`;
  if (!create) return null;
  const id = randomUUID();
  store.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return `v:${id}`;
}

/** Heart counts for these personas, and whether the current visitor has hearted each. Missing ones count as 0. */
export async function getLikeStates(listingIds: string[]): Promise<Record<string, LikeState>> {
  const ids = [...new Set(listingIds)].filter((id) => UUID.test(id));
  const out: Record<string, LikeState> = Object.fromEntries(ids.map((id) => [id, { likes: 0, liked: false }]));
  if (!ids.length) return out;
  try {
    const liker = await currentLiker();
    const { data, error } = await adminClient().rpc("listing_like_counts", { p_listings: ids, p_liker: liker });
    if (error) throw error;
    for (const r of (data ?? []) as { listing_id: string; likes: number; liked: boolean }[]) out[r.listing_id] = { likes: r.likes, liked: r.liked };
  } catch (e) {
    // Hearts are a nice-to-have: before migration 0017 (or on an error) the page shows 0 instead of failing.
    console.warn("[marketplace] heart counts unavailable", e instanceof Error ? e.message : e);
  }
  return out;
}
