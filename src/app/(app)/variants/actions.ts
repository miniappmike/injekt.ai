"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { entitlements } from "@/lib/entitlements";
import { saveHistory } from "@/lib/history";
import { isOwnPath } from "@/lib/uploads";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { prepareVision } from "@/lib/ai/vision-run";
import {
  attachOrder,
  buildCarouselTask,
  buildVariantTask,
  DEFAULT_VARIANT_COUNT,
  EXTRA_IMAGE_LABEL,
  MAX_EXTRA_IMAGES,
  MAX_VARIANT_COUNT,
  parseCarousel,
  parseVariants,
  VARIANT_OPTIONS,
  type VariantOptionId,
} from "@/lib/ai/tasks/variants";

type Ok<T> = ({ ok: true } & T) | AiFailure;

const MAX_SLIDES = 8;

// The user's own uploads only, at most MAX_EXTRA_IMAGES, no repeats. Null if any of them isn't theirs.
function checkExtras(userId: string, paths: unknown): string[] | null {
  const list = Array.isArray(paths) ? [...new Set(paths.filter((p): p is string => typeof p === "string" && !!p))] : [];
  if (list.length > MAX_EXTRA_IMAGES || list.some((p) => !isOwnPath(userId, p))) return null;
  return list;
}

export async function writeVariantEdits(input: {
  imagePath: string;
  characterId?: string | null;
  options: VariantOptionId[];
  /** How many variations to write; each changes all the chosen options. */
  count?: number;
  note?: string;
  /** Up to 2 extra images (vibe, outfit) sent after the image to edit. */
  extraPaths?: string[];
}): Promise<Ok<{ variants: { label: string; prompt: string }[]; attach: string[] }>> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "variants");
    const valid = new Set<string>(VARIANT_OPTIONS.map((o) => o.id));
    const options = [...new Set(input.options)].filter((o) => valid.has(o));
    if (!options.length) return { ok: false, error: "Pick at least one thing to change." };
    if (!isOwnPath(user.id, input.imagePath)) return { ok: false, error: "Add the image to make variants of." };
    const extraPaths = checkExtras(user.id, input.extraPaths);
    if (!extraPaths) return { ok: false, error: "One of the extra images couldn't be used. Add it again." };
    await enforceRateLimit(user.id, "llm", 20, 60);

    const { client, character, references, extras } = await prepareVision(supabase, user.id, input.characterId ?? null, [
      { label: "image to edit", path: input.imagePath },
      ...extraPaths.map((path) => ({ label: EXTRA_IMAGE_LABEL, path })),
    ], "variants");
    const count = Math.min(Math.max(Math.round(Number(input.count)) || DEFAULT_VARIANT_COUNT, 1), MAX_VARIANT_COUNT);
    const reply = await client.run(buildVariantTask({ character, references, image: extras[0], extras: extras.slice(1), options, count, note: input.note }));
    const variants = parseVariants(reply, count);

    await saveHistory(
      supabase,
      user.id,
      variants.map((v) => ({
        characterId: input.characterId ?? null,
        kind: "variant" as const,
        label: `Variant · ${v.label}`,
        prompt: v.prompt,
        imagePath: input.imagePath,
        extraPaths,
      })),
    );
    return { ok: true, variants, attach: attachOrder(references, "image to edit", extras.slice(1)) };
  } catch (e) {
    return toFailure(e);
  }
}

export async function planCarousel(input: {
  coverPath: string;
  characterId?: string | null;
  slides: number;
  note?: string;
  /** Up to 2 extra images (vibe, outfit) sent after the cover. */
  extraPaths?: string[];
}): Promise<Ok<{ slides: { title: string; prompt: string }[]; attach: string[] }>> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "variants");
    const count = Math.min(Math.max(Math.round(input.slides) || 5, 3), MAX_SLIDES);
    if (!isOwnPath(user.id, input.coverPath)) return { ok: false, error: "Add the cover image." };
    const extraPaths = checkExtras(user.id, input.extraPaths);
    if (!extraPaths) return { ok: false, error: "One of the extra images couldn't be used. Add it again." };
    await enforceRateLimit(user.id, "llm", 20, 60);

    const { client, character, references, extras } = await prepareVision(supabase, user.id, input.characterId ?? null, [
      { label: "cover image", path: input.coverPath },
      ...extraPaths.map((path) => ({ label: EXTRA_IMAGE_LABEL, path })),
    ], "carousel");
    const reply = await client.run(buildCarouselTask({ character, references, cover: extras[0], extras: extras.slice(1), slides: count, note: input.note }));
    const slides = parseCarousel(reply, count - 1);

    await saveHistory(
      supabase,
      user.id,
      slides.map((s, i) => ({
        characterId: input.characterId ?? null,
        kind: "carousel" as const,
        label: `Carousel · slide ${i + 2} · ${s.title}`,
        prompt: s.prompt,
        imagePath: input.coverPath,
        extraPaths,
      })),
    );
    return { ok: true, slides, attach: attachOrder(references, "cover image", extras.slice(1)) };
  } catch (e) {
    return toFailure(e);
  }
}
