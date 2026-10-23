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
  parseCarousel,
  parseVariants,
  VARIANT_OPTIONS,
  type VariantOptionId,
} from "@/lib/ai/tasks/variants";

type Ok<T> = ({ ok: true } & T) | AiFailure;

const MAX_SLIDES = 8;

export async function writeVariantEdits(input: {
  imagePath: string;
  characterId?: string | null;
  options: VariantOptionId[];
  note?: string;
}): Promise<Ok<{ variants: { label: string; prompt: string }[]; attach: string[] }>> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "variants");
    const valid = new Set<string>(VARIANT_OPTIONS.map((o) => o.id));
    const options = [...new Set(input.options)].filter((o) => valid.has(o));
    if (!options.length) return { ok: false, error: "Pick at least one thing to change." };
    if (!isOwnPath(user.id, input.imagePath)) return { ok: false, error: "Add the image to make variants of." };
    await enforceRateLimit(user.id, "llm", 20, 60);

    const { client, character, references, extras } = await prepareVision(supabase, user.id, input.characterId ?? null, [
      { label: "image to edit", path: input.imagePath },
    ]);
    const reply = await client.run(buildVariantTask({ character, references, image: extras[0], options, note: input.note }));
    const variants = parseVariants(reply, options.length);

    await saveHistory(
      supabase,
      user.id,
      variants.map((v) => ({
        characterId: input.characterId ?? null,
        kind: "variant" as const,
        label: `Variant · ${v.label}`,
        prompt: v.prompt,
        imagePath: input.imagePath,
      })),
    );
    return { ok: true, variants, attach: attachOrder(references, "image to edit") };
  } catch (e) {
    return toFailure(e);
  }
}

export async function planCarousel(input: {
  coverPath: string;
  characterId?: string | null;
  slides: number;
  note?: string;
}): Promise<Ok<{ slides: { title: string; prompt: string }[]; attach: string[] }>> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "variants");
    const count = Math.min(Math.max(Math.round(input.slides) || 5, 3), MAX_SLIDES);
    if (!isOwnPath(user.id, input.coverPath)) return { ok: false, error: "Add the cover image." };
    await enforceRateLimit(user.id, "llm", 20, 60);

    const { client, character, references, extras } = await prepareVision(supabase, user.id, input.characterId ?? null, [
      { label: "cover image", path: input.coverPath },
    ]);
    const reply = await client.run(buildCarouselTask({ character, references, cover: extras[0], slides: count, note: input.note }));
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
      })),
    );
    return { ok: true, slides, attach: attachOrder(references, "cover image") };
  } catch (e) {
    return toFailure(e);
  }
}
