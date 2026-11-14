import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { parseInviteCode } from "@/lib/invites";

export interface InviteInfo {
  /** Their own code, or null before migration 0027 is run. */
  code: string | null;
  /** Friends who signed up with their link. */
  joined: number;
}

/** A person's invite code and how many friends signed up with it. Never throws: no migration just means no code. */
export async function getInviteInfo(supabase: SupabaseClient, userId: string): Promise<InviteInfo> {
  try {
    const { data, error } = await supabase.from("profiles").select("invite_code").eq("id", userId).maybeSingle();
    if (error || !data?.invite_code) return { code: null, joined: 0 };
    const { count } = await supabase.from("invites").select("id", { count: "exact", head: true }).eq("inviter_id", userId);
    return { code: String(data.invite_code), joined: count ?? 0 };
  } catch {
    return { code: null, joined: 0 };
  }
}

/**
 * Notes that a new account came in through an invite code. Never throws and never blocks sign-up: a bad code, the
 * person's own code or a missing migration all just record nothing.
 */
export async function recordInvite(inviteeId: string, rawCode: unknown): Promise<boolean> {
  const code = parseInviteCode(rawCode);
  if (!code) return false;
  try {
    const { data, error } = await adminClient().rpc("record_invite", { p_invitee: inviteeId, p_code: code });
    return !error && data === true;
  } catch {
    return false;
  }
}
