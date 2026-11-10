"use server";

import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/ratelimit";
import { currentLiker } from "@/lib/marketplace/likes";

/**
 * Counts one view of a persona's page: once per person per day (the database ignores repeats), signed in or not.
 * Called by the persona page after it opens. Quietly does nothing on any problem: a view is never worth an error.
 */
export async function recordView(listingId: string): Promise<void> {
  const id = z.string().uuid().safeParse(listingId);
  if (!id.success) return;
  try {
    const viewer = (await currentLiker({ create: true }))!;
    await enforceRateLimit(viewer, "view", 60, 60);
    await adminClient().rpc("record_listing_view", { p_listing: id.data, p_viewer: viewer });
  } catch {
    // Rate limited, offline, or before migration 0018: skip it.
  }
}
