"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runLikenessReport, runQuickLikeness, type ImageSource } from "@/lib/likeness-run";
import type { LikenessReport, QuickLikeness } from "@/lib/ai/prompts/likeness";

export async function checkLikeness(input: { characterId: string; image: ImageSource; promptUsed?: string }): Promise<({ ok: true } & { report: LikenessReport }) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, report: await withDaily(supabase, user.id, "likeness", () => runLikenessReport(supabase, user.id, input)) };
  } catch (e) {
    return toFailure(e);
  }
}

/**
 * The quick score shown under every generated image of a character (generation is on only with the person's own image
 * key). Counted as a likeness check.
 */
export async function quickLikeness(input: { characterId: string; image: ImageSource; original?: ImageSource }): Promise<({ ok: true } & { result: QuickLikeness }) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 30, 60);
    return { ok: true, result: await withDaily(supabase, user.id, "likeness", () => runQuickLikeness(supabase, user.id, input)) };
  } catch (e) {
    return toFailure(e);
  }
}
