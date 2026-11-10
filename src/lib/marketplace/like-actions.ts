"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/ratelimit";
import { RateLimitError } from "@/lib/errors";
import { currentLiker } from "@/lib/marketplace/likes";

export type LikeResult = { ok: true; liked: boolean; likes: number } | { ok: false; error: string };

/**
 * Hearts a persona, or takes the heart back. Open to everyone, signed in or not, so it's rate limited per liker and per
 * network address to keep the counts honest.
 */
export async function toggleLike(listingId: string): Promise<LikeResult> {
  const id = z.string().uuid().safeParse(listingId);
  if (!id.success) return { ok: false, error: "That persona couldn't be found." };
  try {
    const liker = (await currentLiker({ create: true }))!;
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await enforceRateLimit(liker, "like", 30, 60);
    await enforceRateLimit(`ip:${ip}`, "like-ip", 120, 60);
    const { data, error } = await adminClient().rpc("toggle_listing_like", { p_listing: id.data, p_liker: liker });
    if (error) {
      if (/like_not_public/.test(error.message)) return { ok: false, error: "This persona isn't on the marketplace right now." };
      throw error;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { liked: boolean; likes: number };
    return { ok: true, liked: row.liked, likes: row.likes };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: "Slow down a little, then try again." };
    console.error("[marketplace] heart failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't save your heart. Try again." };
  }
}
