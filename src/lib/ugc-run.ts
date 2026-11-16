import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { loadForVision } from "@/lib/character-images";
import { ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { getUserTextClient, withDeclineFallback } from "@/lib/ai/text-client";
import { askJson } from "@/lib/ai/json";
import { parseUgcPlan, ugcPlanPrompt, ugcPrompt } from "@/lib/ai/prompts/ugc";
import { sheetRefs, type JobCharacter } from "@/lib/generation-job";
import { MAX_INPUT_IMAGES } from "@/lib/generation";
import { DEFAULT_UGC_SHOTS, MAX_PRODUCT_PHOTOS, MAX_UGC_NOTE, MAX_UGC_SHOTS, type UgcProduct, type UgcShot } from "@/lib/ugc-meta";

/** The product photos go to the planner at this size. */
const EDGE = 1024;

export interface UgcPlan {
  product: UgcProduct;
  /** Each shot, with the image prompt it becomes (shown on the page, and copied when image generation is off). */
  shots: (UgcShot & { prompt: string })[];
  /** What to attach, in order, when running a prompt in another generator. */
  attach: string[];
}

/**
 * One vision call reads the product photos and plans every shot: the setting, outfit, pose and light that fit the
 * product. Her references are not sent to it; the image model gets them with each shot.
 */
export async function runUgcPlan(
  supabase: SupabaseClient,
  userId: string,
  input: { productPaths: string[]; characterId: string; shots?: number; note?: string; avoid?: string[] },
): Promise<UgcPlan> {
  const products = [...new Set((Array.isArray(input.productPaths) ? input.productPaths : []).filter((p): p is string => typeof p === "string" && !!p))];
  if (!products.length) throw new UserFacingError("Add a photo of the product first.");
  if (products.length > MAX_PRODUCT_PHOTOS || products.some((p) => !isOwnPath(userId, p))) throw new UserFacingError("One of the product photos couldn't be used. Add it again.");
  const c = input.characterId ? await selectCharacter<JobCharacter>(supabase, input.characterId, "id, face_sheet_path, body_sheet_path, reference_paths, sheet_pack") : null;
  if (!c) throw new UserFacingError("Pick the character who shows the product.");
  const pack = await ensureSheetPack(supabase, userId, c);
  const refs = sheetRefs(c, pack, MAX_INPUT_IMAGES - products.length);
  if (!refs.paths.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  const n = Math.min(Math.max(Math.round(Number(input.shots)) || DEFAULT_UGC_SHOTS, 1), MAX_UGC_SHOTS);

  const { client, imageMaxEdge, model } = await getUserTextClient(supabase, userId, "vision", "ugc");
  const images = await loadForVision(supabase, products.map((path) => ({ label: "the product photo", path })), Math.min(EDGE, imageMaxEdge ?? EDGE));
  const prompt = ugcPlanPrompt({ photos: products.length, shots: n, note: String(input.note ?? "").slice(0, MAX_UGC_NOTE), avoid: input.avoid });
  const raw = await withDeclineFallback(supabase, userId, "ugc", { client, model }, "llm", (cl) => askJson(cl, { prompt, images: images.map((x) => x.dataUri) }));
  let plan: ReturnType<typeof parseUgcPlan>;
  try {
    plan = parseUgcPlan(raw, n);
  } catch (e) {
    throw new UserFacingError(e instanceof Error ? e.message : "The product couldn't be read. Try again.");
  }
  return {
    product: plan.product,
    shots: plan.shots.map((s) => ({ ...s, prompt: ugcPrompt(refs.R, products.length, plan.product, s) })),
    attach: [...refs.R.roles, ...products.map((_, i) => (products.length > 1 ? `product photo ${i + 1}` : "the product photo"))].map((label, i) => `@image${i + 1}: ${label}`),
  };
}
