"use server";

import { requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { deleteAccount } from "@/lib/account-deletion";
import { entitlements } from "@/lib/entitlements";
import { enforceRateLimit } from "@/lib/ratelimit";
import { RateLimitError } from "@/lib/errors";
import { DELETE_CONFIRM_WORD } from "@/lib/account";


/**
 * Permanently deletes the signed-in account and everything in it, then signs out. Needs the confirmation word typed
 * exactly. Admin accounts can't delete themselves here (so the site is never left without an admin by accident).
 */
export async function deleteMyAccount(confirmation: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, user } = await requireUser();
    if (confirmation !== DELETE_CONFIRM_WORD) return { ok: false, error: `Type ${DELETE_CONFIRM_WORD} to confirm.` };
    await enforceRateLimit(user.id, "delete-account", 3, 600);
    if ((await entitlements.planOf(user.id)) === "admin") return { ok: false, error: "Admin accounts can't be deleted here. Remove admin access first." };
    await deleteAccount(adminClient(), user.id);
    await supabase.auth.signOut().catch(() => {});
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: `Too many tries. Try again in ${Math.ceil(e.retryAfterSeconds / 60)} min.` };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete your account. Try again." };
  }
}
