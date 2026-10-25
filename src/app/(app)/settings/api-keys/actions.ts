"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { saveUserKey } from "@/lib/key-store";
import { MODEL_PATTERN, resolveRoleSetup } from "@/lib/ai/role-setup";
import { dropRole, isShared, readRoles, ROLES, shareRole, type RoleId, type RolePrefs } from "@/lib/ai/roles";
import { enforceRateLimit } from "@/lib/ratelimit";
import { parsePrice } from "@/lib/pricing";
import { getUserTextClient } from "@/lib/ai/text-client";
import { toFailure } from "@/lib/ai/failure";
import { getUserImageConfig, resolveUserImageKey } from "@/lib/ai/image-setup";
import { getImageProvider } from "@/lib/ai/providers/registry";

export type KeyFormState = { error?: string; saved?: string; tested?: string; detail?: string };

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

const roleOf = (v: FormDataEntryValue | null): RoleId | null => ROLES.find((r) => r.id === v)?.id ?? null;

async function loadPrefs(supabase: Supabase, userId: string) {
  const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", userId).maybeSingle();
  return (data?.prefs as Record<string, unknown> | null) ?? {};
}

async function writeRoles(supabase: Supabase, userId: string, prefs: Record<string, unknown>, roles: RolePrefs) {
  await supabase.from("user_settings").update({ prefs: { ...prefs, roles } }).eq("user_id", userId);
}

async function deleteStoredKey(supabase: Supabase, provider: string, role: RoleId) {
  await supabase.rpc("delete_my_api_key", { p_provider: provider, p_kind: role });
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
    custom: formData.get("custom") === "1",
    role,
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
  if (previous && !isShared(previous) && previous.provider !== setup.config.provider) {
    await deleteStoredKey(supabase, previous.provider, role);
  }
  roles[role] = setup.config;
  await writeRoles(supabase, user.id, prefs, roles);

  revalidatePath("/settings/api-keys");
  return { saved: role };
}

// Reuse another job's key with a model of this job's own.
export async function shareRoleKey(_: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const { supabase, user } = await requireUser();
  const role = roleOf(formData.get("role"));
  const from = roleOf(formData.get("from"));
  const model = String(formData.get("model") ?? "").trim();
  if (!role || !from) return { error: "Unknown setting" };
  if (!MODEL_PATTERN.test(model)) return { error: "Enter a valid model name" };

  const prefs = await loadPrefs(supabase, user.id);
  const roles = readRoles(prefs);
  const result = shareRole(roles, role, from, model);
  if (!result.ok) return { error: result.error };

  // Drop this job's own stored key, it is no longer used.
  const previous = roles[role];
  if (previous && !isShared(previous)) await deleteStoredKey(supabase, previous.provider, role);

  await writeRoles(supabase, user.id, prefs, result.roles);
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
  const current = roles[role];
  if (!current) return { error: "Add a key first" };
  // A price entered for the old model no longer applies to the new one.
  const { price: _old, ...rest } = current;
  roles[role] = { ...rest, model };
  await writeRoles(supabase, user.id, prefs, roles);
  revalidatePath("/settings/api-keys");
  return { saved: role };
}

// Lets the person enter what their model costs, so spend can be shown in dollars. Both blank clears it.
export async function updateRolePrice(_: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const { supabase, user } = await requireUser();
  const role = roleOf(formData.get("role"));
  if (!role || role === "image") return { error: "Unknown setting" };
  const input = String(formData.get("priceInput") ?? "");
  const output = String(formData.get("priceOutput") ?? "");

  const prefs = await loadPrefs(supabase, user.id);
  const roles = readRoles(prefs);
  const current = roles[role];
  if (!current) return { error: "Add a key first" };

  const { price: _old, ...rest } = current;
  if (!input.trim() && !output.trim()) {
    roles[role] = rest;
  } else {
    const price = parsePrice(input, output);
    if (!price) return { error: "Enter both prices as numbers, for example 2 and 10." };
    roles[role] = { ...rest, price };
  }
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
  if (current && !isShared(current)) await deleteStoredKey(supabase, current.provider, role);
  await writeRoles(supabase, user.id, prefs, dropRole(roles, role));
  revalidatePath("/settings/api-keys");
}

// One tiny real request, so a bad key, wrong model or spend cap shows up now instead of mid-task.
export async function testRoleKey(_: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const { supabase, user } = await requireUser();
  const role = roleOf(formData.get("role"));
  if (!role) return { error: "Unknown setting" };
  try {
    await enforceRateLimit(user.id, "test-key", 5, 60);
    if (role === "image") {
      // A free balance check, so testing never spends anything.
      const cfg = await getUserImageConfig(supabase, user.id);
      if (!cfg) return { error: "Add an image key first." };
      const { detail } = await getImageProvider("spicyapi").check({ apiKey: await resolveUserImageKey(user.id, cfg) });
      return { tested: role, detail };
    }
    const { client } = await getUserTextClient(supabase, user.id, role, "test");
    const reply = await client.run({ instructions: "Reply with the single word: ok", text: "Connection test." });
    return reply.trim() ? { tested: role } : { error: "The provider answered with an empty reply." };
  } catch (e) {
    return { error: toFailure(e).error };
  }
}
