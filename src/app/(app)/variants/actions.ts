"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { runCarousel, runVariants, type CarouselResult, type VariantResult } from "@/lib/variants-run";
import type { CarouselTypeId, PlatformId, VariantDimId } from "@/lib/variants-meta";

type Ok<T> = ({ ok: true } & T) | AiFailure;

export async function writeVariantEdits(input: {
  imagePath: string;
  characterId?: string | null;
  dims: VariantDimId[];
  count?: number;
  note?: string;
  /** Up to 2 extra images (vibe, outfit) after the image to edit. */
  extraPaths?: string[];
}): Promise<Ok<VariantResult>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await withDaily(supabase, user.id, "runs", () => runVariants(supabase, user.id, input))) };
  } catch (e) {
    return toFailure(e);
  }
}

export async function planCarousel(input: {
  coverPath: string;
  characterId?: string | null;
  types: CarouselTypeId[];
  /** New slides after the cover, 1 to 5 (Write only: variations, 1 to 8). */
  count?: number;
  note?: string;
  extraPaths?: string[];
  /** Write only: finished prompts to paste into another generator, each with what to attach. */
  writeOnly?: boolean;
  /** Where the set will be posted (sets its tone and spice); `platformOther` names it for "other". */
  platform?: PlatformId | null;
  platformOther?: string;
}): Promise<Ok<CarouselResult>> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    return { ok: true, ...(await withDaily(supabase, user.id, "runs", () => runCarousel(supabase, user.id, input))) };
  } catch (e) {
    return toFailure(e);
  }
}
