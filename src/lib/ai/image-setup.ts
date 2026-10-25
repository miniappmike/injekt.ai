import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveRole, providerSupports, readRoles, type RoleId } from "./roles";
import { resolveApiKey } from "@/lib/keys";
import { keyResolverDeps } from "@/lib/key-store";

export interface UserImageConfig {
  model: string;
  /** The provider id the key is stored under ("spicyapi", or "custom" for a SpicyAPI base URL). */
  storedProvider: string;
  /** Which job's key row holds the key (the Image job, or the one it borrows from). */
  keyRole: RoleId;
}

// The user's own image setup, if they have one that can generate images.
export async function getUserImageConfig(supabase: SupabaseClient, userId: string): Promise<UserImageConfig | null> {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  const chosen = effectiveRole(readRoles(data?.prefs), "image");
  if (!chosen || !providerSupports(chosen.cfg, "image")) return null;
  return { model: chosen.cfg.model, storedProvider: chosen.cfg.provider, keyRole: chosen.keyRole };
}

export async function resolveUserImageKey(userId: string, cfg: UserImageConfig): Promise<string> {
  return (await resolveApiKey(keyResolverDeps, userId, cfg.storedProvider, cfg.keyRole)).key;
}
