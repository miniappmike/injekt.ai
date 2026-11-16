"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

/** Saves the Characters page's custom order: `ids` in the order they should show. Needs migration 0034. */
export async function reorderCharacters(ids: string[]): Promise<{ error?: string }> {
  if (!Array.isArray(ids) || ids.length > 500 || new Set(ids).size !== ids.length || !ids.every((id) => typeof id === "string")) {
    return { error: "That order could not be saved." };
  }
  const { supabase, user } = await requireUser();
  // Only her own characters (RLS also enforces this); not updated_at, so "Last edited" isn't changed by arranging.
  const results = await Promise.all(
    ids.map((id, i) => supabase.from("characters").update({ sort_order: i }).eq("id", id).eq("user_id", user.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { error: /sort_order/.test(failed.error.message) ? "Custom order isn't set up yet (run migration 0034)." : failed.error.message };
  }
  revalidatePath("/characters");
  return {};
}
