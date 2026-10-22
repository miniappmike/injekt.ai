import "server-only";
import { adminClient } from "./supabase/admin";
import { decryptSecret, encryptSecret, last4 } from "./crypto";
import { env } from "@/env";
import type { KeyResolverDeps } from "./keys";

export type KeyKind = "image" | "vision" | "llm";

// Only this module ever touches ciphertext, through the service-role client.
export async function saveUserKey(userId: string, provider: string, kind: KeyKind, secret: string) {
  const { error } = await adminClient()
    .from("user_api_keys")
    .upsert(
      {
        user_id: userId,
        provider,
        kind,
        ciphertext: encryptSecret(secret, env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_ID),
        last4: last4(secret),
        key_id: env.ENCRYPTION_KEY_ID,
      },
      { onConflict: "user_id,provider,kind" },
    );
  if (error) throw new Error("Could not save key");
}

export const keyResolverDeps: KeyResolverDeps = {
  async loadUserKey(userId, provider) {
    const { data } = await adminClient()
      .from("user_api_keys")
      .select("ciphertext")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    return data ? decryptSecret(data.ciphertext, env.ENCRYPTION_KEY) : null;
  },
  async isAdmin(userId) {
    const { data } = await adminClient()
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    return data?.is_admin === true;
  },
  serverKeys: { spicyapi: env.SPICY_API_KEY },
};
