"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getProvider } from "@/lib/ai/providers/catalog";
import { saveUserKey } from "@/lib/key-store";
import { validateApiKey } from "@/lib/key-validation";

export type KeyFormState = { error?: string; saved?: string };

export async function saveKey(_: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const { supabase, user } = await requireUser();
  const provider = getProvider(String(formData.get("provider") ?? ""));
  if (!provider) return { error: "Unknown provider" };

  const checked = validateApiKey(String(formData.get("key") ?? ""));
  if (!checked.ok) return { error: checked.error };

  const model = String(formData.get("model") ?? "").trim() || provider.defaultModel;
  if (provider.kind === "llm" && !model) return { error: "Enter a model name for this provider" };
  if (model && !/^[\w./:-]{1,100}$/.test(model)) return { error: "That model name has unexpected characters" };

  try {
    await saveUserKey(user.id, provider.id, provider.kind, checked.key);
  } catch {
    return { error: "Could not save the key. Try again." };
  }

  if (provider.kind === "llm") {
    const { data } = await supabase.from("user_settings").select("default_llm_provider, prefs").eq("user_id", user.id).maybeSingle();
    const prefs = (data?.prefs as { models?: Record<string, string> } | null) ?? {};
    await supabase
      .from("user_settings")
      .update({
        default_llm_provider: data?.default_llm_provider ?? provider.id,
        prefs: { ...prefs, models: { ...prefs.models, [provider.id]: model } },
      })
      .eq("user_id", user.id);
  }
  revalidatePath("/settings/api-keys");
  return { saved: provider.id };
}

export async function deleteKey(formData: FormData) {
  const { supabase } = await requireUser();
  const provider = getProvider(String(formData.get("provider") ?? ""));
  if (!provider) return;
  await supabase.rpc("delete_my_api_key", { p_provider: provider.id, p_kind: provider.kind });
  revalidatePath("/settings/api-keys");
}

export async function makeDefault(formData: FormData) {
  const { supabase, user } = await requireUser();
  const provider = getProvider(String(formData.get("provider") ?? ""));
  if (!provider || provider.kind !== "llm") return;
  await supabase.from("user_settings").update({ default_llm_provider: provider.id }).eq("user_id", user.id);
  revalidatePath("/settings/api-keys");
}
