"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runUgcPlan, type UgcPlan } from "@/lib/ugc-run";

/** Reads the product photos and plans the shots. Counts as one prompt run (like a Photoshoot plan). */
export async function planUgc(input: { productPaths: string[]; characterId: string; shots?: number; note?: string; avoid?: string[] }): Promise<({ ok: true } & UgcPlan) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await withDaily(supabase, user.id, "runs", () => runUgcPlan(supabase, user.id, input))) };
  } catch (e) {
    return toFailure(e);
  }
}
