"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { saveUserKey } from "@/lib/key-store";
import { MODEL_PATTERN, resolveRoleSetup } from "@/lib/ai/role-setup";
import { readRoles, ROLES, type RoleId } from "@/lib/ai/roles";
import { enforceRateLimit } from "@/lib/ratelimit";

export type KeyFormState = { error?: string; saved?: string };

const roleOf = (v: FormDataEntryValue | null): RoleId | null => ROLES.find((r) => r.id === v)?.id ?? null;

async function loadPrefs(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return (data?.prefs as Record<string, unknown> | null) ?? {};
}

async function writeRoles(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  prefs: Record<string, unknown>,
  roles: ReturnType<typeof readRoles>,
) {
  await supabase.from("user_settings").update({ prefs: { ...prefs, roles } }).eq("user_id", userId);
}

export async function saveRoleKey(_: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const { supabase, user } = await requireUser();
  const role = roleOf(formData.get("role"));
  if (!role) return { error: "Unknown setting" };
  try {
    await enforceRateLimit(user.id, "save-key", 10, 60);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const setup = await resolveRoleSetup({
    key: String(formData.get("key") ?? ""),
    model: String(formData.get("model") ?? ""),
    baseUrl: String(formData.get("baseUrl") ?? ""),
  });
  if (!setup.ok) return { error: setup.error };

  try {
    await saveUserKey(user.id, setup.config.provider, role, setup.key);
  } catch {
    return { error: "Could not save the key. Try again." };
  }

  const prefs = await loadPrefs(supabase, user.id);
  const roles = readRoles(prefs);
  const previous = roles[role];
  if (previous && previous.provider !== setup.config.provider) {
    await supabase.rpc("delete_my_api_key", { p_provider: previous.provider, p_kind: role });
  }
  roles[role] = setup.config;
  await writeRoles(supabase, user.id, prefs, roles);

  revalidatePath("/settings/api-keys");
  return { saved: role };
}

export async function updateRoleModel(_: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const { supabase, user } = await requireUser();
  const role = roleOf(formData.get("role"));
  const model = String(formData.get("model") ?? "").trim();
  if (!role) return { error: "Unknown setting" };
  if (!MODEL_PATTERN.test(model)) return { error: "Enter a valid model name" };

  const prefs = await loadPrefs(supabase, user.id);
  const roles = readRoles(prefs);
  if (!roles[role]) return { error: "Add a key first" };
  roles[role] = { ...roles[role]!, model };
  await writeRoles(supabase, user.id, prefs, roles);
  revalidatePath("/settings/api-keys");
  return { saved: role };
}

export async function removeRoleKey(formData: FormData) {
  const { supabase, user } = await requireUser();
  const role = roleOf(formData.get("role"));
  if (!role) return;
  const prefs = await loadPrefs(supabase, user.id);
  const roles = readRoles(prefs);
  const current = roles[role];
  if (current) await supabase.rpc("delete_my_api_key", { p_provider: current.provider, p_kind: role });
  delete roles[role];
  await writeRoles(supabase, user.id, prefs, roles);
  revalidatePath("/settings/api-keys");
}
