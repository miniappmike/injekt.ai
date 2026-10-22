"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { ApiKeyRequiredError, RateLimitError } from "@/lib/errors";
import { ProviderError } from "@/lib/ai/providers/text";
import { getUserTextClient } from "@/lib/ai/text-client";
import { buildProfileTask, parseProfileResponse } from "@/lib/ai/tasks/profile-builder";
import { buildReplacementPromptTask, type PromptStyle } from "@/lib/ai/tasks/prompt-writer";
import { loadForVision, referenceList } from "@/lib/character-images";
import { isOwnPath } from "@/lib/uploads";
import type { CharacterProfile } from "@/lib/characters";

export type AiResult<T> = ({ ok: true } & T) | { ok: false; error: string; redirectTo?: string };

function failure(e: unknown): { ok: false; error: string; redirectTo?: string } {
  if (e instanceof ApiKeyRequiredError) return { ok: false, error: "Add an API key to continue.", redirectTo: e.redirectTo };
  if (e instanceof RateLimitError) return { ok: false, error: `Too many requests. Try again in ${e.retryAfterSeconds}s.` };
  if (e instanceof ProviderError) return { ok: false, error: e.message };
  console.error("ai action failed", e instanceof Error ? e.message : e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

export async function buildProfile(characterId: string): Promise<AiResult<{ profile: CharacterProfile }>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 10, 60);

    const { data: c } = await supabase
      .from("characters")
      .select("name, height, weight, always_keep, face_sheet_path, body_sheet_path, reference_paths")
      .eq("id", characterId)
      .maybeSingle();
    if (!c) return { ok: false, error: "Character not found" };

    const refs = referenceList(c);
    if (!refs.length) return { ok: false, error: "Upload a face sheet, body sheet or reference photo first." };

    const client = await getUserTextClient(supabase, user.id);
    const images = await loadForVision(supabase, refs);
    const reply = await client.run(buildProfileTask(c, images));
    return { ok: true, profile: parseProfileResponse(reply) };
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

    const client = await getUserTextClient(supabase, user.id);
    const references = await loadForVision(supabase, refs);

    const results: WrittenPrompt[] = [];
    for (const path of targets) {
      try {
        await enforceRateLimit(user.id, "llm", 20, 60);
        const [target] = await loadForVision(supabase, [{ label: "target photo", path }]);
        const prompt = await client.run(
          buildReplacementPromptTask({ character: { ...c, profile: c.profile as CharacterProfile }, references, target, outfit: input.outfit, style: input.style }),
        );
        results.push({ path, prompt: prompt.trim() });
      } catch (e) {
        const f = failure(e);
        if (f.redirectTo) return f;
        results.push({ path, error: f.error });
      }
    }
    return { ok: true, results };
  } catch (e) {
    return failure(e);
  }
}
