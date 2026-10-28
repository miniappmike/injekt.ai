"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { entitlements } from "@/lib/entitlements";
import { saveHistory } from "@/lib/history";
import { getUserTextClient } from "@/lib/ai/text-client";
import { runProfileBuild } from "@/lib/ai/build-profile";
import { buildReplacementPromptTask, type PromptStyle } from "@/lib/ai/tasks/prompt-writer";
import { withRealism } from "@/lib/ai/tasks/realism";
import { loadForVision, referenceList } from "@/lib/character-images";
import { isOwnPath } from "@/lib/uploads";
import { ensureSheetPack, selectCharacter, type PackCharacter } from "@/lib/sheet-pack";
import { packStateText } from "@/lib/ai/prompts/identity";
import type { CharacterProfile } from "@/lib/characters";

export type AiResult<T> = ({ ok: true } & T) | AiFailure;

const failure = toFailure;

export async function buildProfile(characterId: string): Promise<AiResult<{ profile: CharacterProfile }>> {
  try {
    const { supabase, user } = await requireUser();
    const result = await runProfileBuild(supabase, user.id, characterId);
    if (result.ok) revalidatePath("/characters");
    return result;
  } catch (e) {
    return failure(e);
  }
}

/**
 * Reads her sheets into the sheet pack now (normally done on first Generate). Uses the person's own vision key; with
 * none, Generate keeps sending the whole sheet.
 */
export async function readSheet(characterId: string): Promise<AiResult<{ state: string; read: boolean }>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 10, 60);
    const c = await selectCharacter<PackCharacter>(supabase, characterId, "id, face_sheet_path, body_sheet_path, sheet_pack");
    if (!c) return { ok: false, error: "Character not found" };
    if (!c.face_sheet_path && !c.body_sheet_path) return { ok: false, error: "Add a face sheet or body sheet first." };
    const pack = await ensureSheetPack(supabase, user.id, c);
    revalidatePath(`/characters/${characterId}`);
    if (!pack) return { ok: false, error: "The sheet couldn't be read. Check that a Vision key is set up under API keys, then try again in a few minutes." };
    return { ok: true, read: true, state: packStateText({ hasBody: !!c.body_sheet_path, hasFace: !!c.face_sheet_path, pack }) };
  } catch (e) {
    return failure(e);
  }
}

export interface WrittenPrompt {
  path: string;
  prompt?: string;
  error?: string;
}

export async function writeReplacementPrompts(input: {
  characterId: string;
  targetPaths: string[];
  outfit?: string;
  style: PromptStyle;
}): Promise<AiResult<{ results: WrittenPrompt[] }>> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "prompt_writer");
    const targets = input.targetPaths.slice(0, 10).filter((p) => isOwnPath(user.id, p));
    if (!targets.length) return { ok: false, error: "Add at least one target image." };
    if (input.style !== "sectioned" && input.style !== "match") return { ok: false, error: "Unknown prompt style" };

    const { data: c } = await supabase
      .from("characters")
      .select("name, height, weight, always_keep, profile, face_sheet_path, body_sheet_path, reference_paths")
      .eq("id", input.characterId)
      .maybeSingle();
    if (!c) return { ok: false, error: "Character not found" };

    const refs = referenceList(c);
    if (!refs.length) return { ok: false, error: "This character needs a face sheet, body sheet or reference photo first." };

    const { client, imageMaxEdge } = await getUserTextClient(supabase, user.id, "vision", "prompt");
    const references = await loadForVision(supabase, refs, imageMaxEdge);

    const results: WrittenPrompt[] = [];
    for (const path of targets) {
      try {
        await enforceRateLimit(user.id, "llm", 20, 60);
        const [target] = await loadForVision(supabase, [{ label: "target photo", path }], imageMaxEdge);
        const prompt = await client.run(
          buildReplacementPromptTask({ character: { ...c, profile: c.profile as CharacterProfile }, references, target, outfit: input.outfit, style: input.style }),
        );
        results.push({ path, prompt: withRealism(prompt) });
      } catch (e) {
        const f = failure(e);
        if (f.redirectTo) return f;
        results.push({ path, error: f.error });
      }
    }
    await saveHistory(
      supabase,
      user.id,
      results
        .filter((r) => r.prompt)
        .map((r) => ({
          characterId: input.characterId,
          kind: "inject" as const,
          label: `Inject · ${c.name} · ${input.style === "match" ? "Match the target" : "Sectioned"}`,
          prompt: r.prompt!,
          imagePath: r.path,
        })),
    );
    return { ok: true, results };
  } catch (e) {
    return failure(e);
  }
}
