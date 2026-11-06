import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/ratelimit";
import { LimitReachedError } from "@/lib/errors";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { entitlements } from "@/lib/entitlements";
import type { Allowance } from "@/lib/entitlements-core";
import { getUserTextClient } from "@/lib/ai/text-client";
import { buildProfileTask, parseProfileResponse, PROFILE_ROLES } from "@/lib/ai/tasks/profile-builder";
import { loadForVision, type CharacterImagePaths } from "@/lib/character-images";
import { ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import type { CharacterProfile } from "@/lib/characters";

export type ProfileBuildResult = ({ ok: true; profile: CharacterProfile } | AiFailure) & { code?: BuildCode };

/** Why a build did not produce a profile, in terms a page can show without trusting free text. */
export type BuildCode = "no_images" | "no_key" | "limit" | "failed";

// Reads the character's images, asks the user's vision model for a profile and saves it to the character.
// Takes a free-plan generation first and gives it back if nothing useful came out.
export async function runProfileBuild(supabase: SupabaseClient, userId: string, characterId: string): Promise<ProfileBuildResult> {
  let allowance: Allowance | undefined;
  try {
    await enforceRateLimit(userId, "llm", 10, 60);

    const c = await selectCharacter<CharacterImagePaths & PackCharacter & { height: string | null; weight: string | null; always_keep: string | null }>(
      supabase,
      characterId,
      "id, name, height, weight, always_keep, face_sheet_path, body_sheet_path, reference_paths, sheet_pack",
    );
    if (!c) return { ok: false, error: "Character not found", code: "failed" };

    const refs = profileImages(c);
    if (!refs.length) return { ok: false, error: "Upload a face sheet, body sheet or reference photo first.", code: "no_images" };

    allowance = await entitlements.useAllowance(userId, "profile_builds");

    const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "profile");
    const images = await loadForVision(supabase, refs.map((r) => ({ label: r.role, path: r.path })), imageMaxEdge);
    const reply = await client.run(buildProfileTask(c, images.map((img) => ({ role: img.label, dataUri: img.dataUri }))));
    const profile = parseProfileResponse(reply);

    // Saved right away so the user can stay on the page and generate again.
    const { error } = await supabase
      .from("characters")
      .update({ profile, updated_at: new Date().toISOString() })
      .eq("id", characterId);
    if (error) throw new Error("The profile was generated but could not be saved. Try again.");
    // Her sheets are read into the sheet pack once, after the reply, so the first Generate doesn't wait for it.
    if (c.face_sheet_path || c.body_sheet_path) after(() => ensureSheetPack(supabase, userId, c).catch(() => null));
    return { ok: true, profile };
  } catch (e) {
    await allowance?.release();
    const f = toFailure(e);
    const code: BuildCode = f.redirectTo ? "no_key" : e instanceof LimitReachedError ? "limit" : "failed";
    return { ...f, code };
  }
}

/** The images the profile is built from, in the artifact's order and with its roles: face sheet, body sheet, photos. */
export function profileImages(c: CharacterImagePaths): { role: string; path: string }[] {
  const out: { role: string; path: string }[] = [];
  if (c.face_sheet_path) out.push({ role: PROFILE_ROLES.faceSheet, path: c.face_sheet_path });
  if (c.body_sheet_path) out.push({ role: out.length ? PROFILE_ROLES.bodySheet : PROFILE_ROLES.onlySheet, path: c.body_sheet_path });
  for (const path of c.reference_paths) out.push({ role: PROFILE_ROLES.photo, path });
  return out;
}
