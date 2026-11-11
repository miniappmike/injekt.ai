"use server";

import { requireUser } from "@/lib/auth";
import { collectGeneration, quoteGeneration, startGeneration, type CollectResult } from "@/lib/generation";
import { toFailure, type AiFailure } from "@/lib/ai/failure";

// The browser starts a generation, then asks about it every few seconds until it is done. Polling from here (instead of
// waiting for a webhook) works with every person's own key, because only their key can look at their job.
export async function startImageGeneration(raw: unknown): Promise<({ ok: true; generationId: string; free: boolean } | AiFailure)> {
  try {
    const { supabase, user } = await requireUser();
    return { ok: true, ...(await startGeneration(supabase, user, raw)) };
  } catch (e) {
    return toFailure(e);
  }
}

export async function checkImageGeneration(generationId: string): Promise<({ ok: true } & CollectResult) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    return { ok: true, ...(await collectGeneration(supabase, user, generationId)) };
  } catch (e) {
    return toFailure(e);
  }
}

export async function quoteImageGeneration(raw: unknown): Promise<{ ok: true; estimatedCost: string | null } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    const quote = await quoteGeneration(supabase, user, raw);
    return { ok: true, estimatedCost: quote?.estimatedCost ?? null };
  } catch (e) {
    return toFailure(e);
  }
}

/** The job a Generate press started, by the id the browser sent with it: for a phone that lost the answer. */
export async function findGenerationByRef(clientRef: string): Promise<{ ok: true; generationId: string | null }> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(clientRef)) return { ok: true, generationId: null };
    const { supabase } = await requireUser();
    const { data } = await supabase
      .from("generations")
      .select("id")
      .eq("params->>client_ref", clientRef)
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .limit(1)
      .maybeSingle();
    return { ok: true, generationId: (data?.id as string | undefined) ?? null };
  } catch {
    return { ok: true, generationId: null };
  }
}
