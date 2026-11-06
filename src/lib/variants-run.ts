import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { attachText, linkAttachItems, standaloneRefs, tagItems, type AttachItem } from "@/lib/standalone";
import { loadForVision, referencesFor } from "@/lib/character-images";
import { ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { saveHistory } from "@/lib/history";
import { recentPoses, rememberPoses, RECENT_SEND } from "@/lib/recent-poses";
import { getUserTextClient } from "@/lib/ai/text-client";
import { askJson } from "@/lib/ai/json";
import { HAIRSTYLES, POSE_HINTS, SOCIAL_POSES, shuffleArr } from "@/lib/ai/prompts/pools";
import { carouselPrompt, carouselSlidePrompt, dimText, finishVariant, parseCarousel, slideCopyText, variantPrompt, variantTags, type Slide } from "@/lib/ai/prompts/variants";
import {
  CAROUSEL_TYPES,
  DEFAULT_NEW_SLIDES,
  DEFAULT_VARIANT_COUNT,
  DEFAULT_WRITE_ONLY,
  MAX_EXTRA_IMAGES,
  MAX_NEW_SLIDES,
  MAX_VARIANT_COUNT,
  MAX_WRITE_ONLY,
  VARIANT_DIMS,
  PLATFORMS,
  PLATFORM_OTHER_MAX,
  type CarouselTypeId,
  type PlatformId,
  type VariantDimId,
} from "@/lib/variants-meta";
import type { CharacterProfile } from "@/lib/characters";
import type { Anchors } from "@/lib/ai/prompts/identity";

/** The image is sent to the prompt writer at this size (artifact: 1024). */
const EDGE = 1024;

interface Row {
  id: string;
  name: string;
  profile: CharacterProfile | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
  sheet_pack?: unknown;
}

/** The user's own uploads only, at most MAX_EXTRA_IMAGES, no repeats. */
export function checkExtras(userId: string, paths: unknown): string[] {
  const list = Array.isArray(paths) ? [...new Set(paths.filter((p): p is string => typeof p === "string" && !!p))] : [];
  if (list.length > MAX_EXTRA_IMAGES || list.some((p) => !isOwnPath(userId, p))) throw new UserFacingError("One of the extra images couldn't be used. Add it again.");
  return list;
}

const clampCount = (v: unknown, def: number, max: number) => Math.min(Math.max(Math.round(Number(v)) || def, 1), max);

async function character(supabase: SupabaseClient, id: string | null | undefined): Promise<Row | null> {
  if (!id) return null;
  const c = await selectCharacter<Row>(supabase, id, "id, name, profile, face_sheet_path, body_sheet_path, reference_paths, sheet_pack");
  if (!c) throw new UserFacingError("Character not found.");
  return c;
}

/** Her recognisable traits as the artifact restates them: the traits field, else the identity line. */
const traitsOf = (c: Row | null) => (c ? c.profile?.distinctive_traits || c.profile?.identity_line || "" : "");

export interface VariantResult {
  variants: { label: string; changes: string; prompt: string; historyId?: string | null }[];
  /** What to attach, in order, when running the prompts elsewhere. */
  attach: string[];
}

/** Variant edits (artifact writeVariants): each edit changes one or two of the chosen things; together they cover them. */
export async function runVariants(
  supabase: SupabaseClient,
  userId: string,
  input: { imagePath: string; characterId?: string | null; dims: VariantDimId[]; count?: number; note?: string; extraPaths?: string[] },
  random: () => number = Math.random,
): Promise<VariantResult> {
  if (!isOwnPath(userId, input.imagePath)) throw new UserFacingError("Add the image you want to vary.");
  const valid = new Set<string>(VARIANT_DIMS.map((d) => d.id));
  const dims = [...new Set(input.dims)].filter((d) => valid.has(d));
  if (!dims.length) throw new UserFacingError("Turn on at least one thing to change.");
  const extraPaths = checkExtras(userId, input.extraPaths);
  const n = clampCount(input.count, DEFAULT_VARIANT_COUNT, MAX_VARIANT_COUNT);
  const extra = String(input.note ?? "").trim().slice(0, 2000);
  const c = await character(supabase, input.characterId);

  // Her sheets go first in the generator (her first photo when she has no sheet), then the photo, then the extras.
  const refs = c ? referencesFor("variant", c) : [];
  if (c && !refs.length) throw new UserFacingError("This character needs a face sheet, body sheet or reference photo first.");
  const isSheet = !!c && refs.some((r) => r.path === c.face_sheet_path || r.path === c.body_sheet_path);
  const vt = c ? variantTags(refs.length, isSheet, extraPaths.length) : null;
  const pack = c && (c.face_sheet_path || c.body_sheet_path) ? await ensureSheetPack(supabase, userId, c) : null;
  const so = pack?.anchors.sheetOutfit ?? "";

  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "variants");
  const recent = (await recentPoses(supabase, userId)).poses.slice(-RECENT_SEND);
  const prompt = variantPrompt({
    n,
    dims: dimText(dims),
    vt,
    traits: traitsOf(c),
    so,
    recent,
    inspo: shuffleArr(SOCIAL_POSES, random).slice(0, 6),
    hairExamples: shuffleArr(HAIRSTYLES, random).slice(0, 5),
    extra,
    extraTags: extraPaths.map((_, i) => "@image" + (i + 2)),
  });
  const images = await loadForVision(
    supabase,
    [input.imagePath, ...extraPaths].map((path) => ({ label: "image", path })),
    Math.min(EDGE, imageMaxEdge ?? EDGE),
  );
  const raw = (await askJson(client, { prompt, images: images.map((x) => x.dataUri) })) as { variants?: unknown };
  const list = (Array.isArray(raw?.variants) ? raw.variants : [])
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && typeof v.prompt === "string" && !!v.prompt.trim())
    .slice(0, n);
  if (!list.length) throw new UserFacingError("The model did not write any variants. Try again.");
  const variants = list.map((v) => ({ label: String(v.label || "Variant").slice(0, 40), changes: String(v.changes || "").slice(0, 80), prompt: finishVariant(String(v.prompt), vt, so, extra) }));

  const variantIds = await saveHistory(
    supabase,
    userId,
    variants.map((v) => ({ characterId: c?.id ?? null, kind: "variant" as const, label: `Variant · ${v.label}`, prompt: v.prompt, imagePath: input.imagePath, extraPaths })),
  );
  variants.forEach((v, i) => Object.assign(v, { historyId: variantIds[i] ?? null }));
  await rememberPoses(supabase, userId, variants.map((v) => v.label));
  const attach = [...refs.map((r) => r.label), "the image to edit", ...extraPaths.map(() => "extra image")].map((label, i) => `@image${i + 1}: ${label}`);
  return { variants, attach };
}

export interface CarouselResult {
  theme: string;
  /** Each slide with its placeholders (for Generate) and as the person copies it. */
  slides: (Slide & { copy: string; historyId?: string | null; attach?: string[]; attachItems?: AttachItem[] })[];
}

/**
 * A slide as a finished prompt for any generator (Write only): framed the way Generate frames it, with the identity
 * wording, realism and rules written in, and her sheets (not the app's crops, which the person doesn't have) as the
 * references. Slides without her use the photo alone. `attach` lists the images in @image order.
 */
export function standaloneSlide(
  slide: Pick<Slide, "person" | "prompt">,
  c: Row | null,
  anchors: Anchors | null,
  extraCount: number,
): { copy: string; attach: string[]; attachItems: AttachItem[] } {
  const refs = c && slide.person !== "none" ? standaloneRefs(c) : [];
  const copy = carouselSlidePrompt(slide, { roles: refs.map((r) => r.role), anchors: refs.length ? anchors : null }, extraCount);
  const attachItems = tagItems([
    ...refs.map((r) => ({ label: r.label, source: "ref" as const, path: r.path })),
    { label: "your photo", source: "photo" as const },
    ...Array.from({ length: extraCount }, (_, i) => ({ label: `extra image ${i + 1}`, source: "extra" as const, index: i })),
  ]);
  return { copy, attach: attachText(attachItems), attachItems };
}

/** The carousel creative director (artifact writeCarousel): new slides that follow the cover. */
export async function runCarousel(
  supabase: SupabaseClient,
  userId: string,
  input: {
    coverPath: string;
    characterId?: string | null;
    types: CarouselTypeId[];
    count?: number;
    note?: string;
    extraPaths?: string[];
    writeOnly?: boolean;
    platform?: PlatformId | null;
    platformOther?: string;
  },
  random: () => number = Math.random,
): Promise<CarouselResult> {
  if (!isOwnPath(userId, input.coverPath)) throw new UserFacingError("Add the image to build the carousel around.");
  const valid = new Set<string>(CAROUSEL_TYPES.map((t) => t.id));
  const types = [...new Set(input.types)].filter((t) => valid.has(t));
  if (!types.length) throw new UserFacingError("Turn on at least one slide type.");
  const extraPaths = checkExtras(userId, input.extraPaths);
  const n = input.writeOnly ? clampCount(input.count, DEFAULT_WRITE_ONLY, MAX_WRITE_ONLY) : clampCount(input.count, DEFAULT_NEW_SLIDES, MAX_NEW_SLIDES);
  const c = await character(supabase, input.characterId);

  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "carousel");
  const platform = PLATFORMS.some((x) => x.id === input.platform) ? (input.platform as PlatformId) : undefined;
  // Poses used lately and a fresh handful of ideas, so sets don't keep landing on the same poses.
  const recent = (await recentPoses(supabase, userId)).poses.slice(-RECENT_SEND);
  const prompt = carouselPrompt({
    n,
    recent,
    inspo: shuffleArr([...POSE_HINTS, ...SOCIAL_POSES], random).slice(0, 6),
    platform,
    platformOther: platform === "other" ? String(input.platformOther ?? "").slice(0, PLATFORM_OTHER_MAX) : "",
    types,
    hasCharacter: !!c,
    traits: traitsOf(c),
    extra: String(input.note ?? "").trim().slice(0, 2000),
    extraCount: extraPaths.length,
    directionFirst: !!input.writeOnly,
  });
  const images = await loadForVision(
    supabase,
    [input.coverPath, ...extraPaths].map((path) => ({ label: "image", path })),
    Math.min(EDGE, imageMaxEdge ?? EDGE),
  );
  const plan = parseCarousel(await askJson(client, { prompt, images: images.map((x) => x.dataUri) }), n);
  // Write only: her sheet's words (hair, body) go into each prompt, as Generate would add them.
  const anchors = input.writeOnly && c && (c.face_sheet_path || c.body_sheet_path) ? ((await ensureSheetPack(supabase, userId, c))?.anchors ?? null) : null;
  const slides: CarouselResult["slides"] = plan.slides.map((s) =>
    input.writeOnly ? { ...s, ...standaloneSlide(s, c, anchors, extraPaths.length) } : { ...s, copy: slideCopyText(s, !!c) },
  );
  if (input.writeOnly) await linkAttachItems(supabase, slides.flatMap((s) => s.attachItems ?? []));
  await rememberPoses(supabase, userId, slides.filter((s) => s.person !== "none").map((s) => s.pose || s.label));

  const slideIds = await saveHistory(
    supabase,
    userId,
    slides.map((s, i) => ({
      characterId: c?.id ?? null,
      kind: "carousel" as const,
      label: input.writeOnly ? `Write only · ${i + 1} · ${s.label}` : `Carousel · slide ${i + 2} · ${s.label}`,
      prompt: s.copy,
      imagePath: input.coverPath,
      extraPaths,
      // Generate from History frames the slide again from these.
      meta: { person: s.person, slidePrompt: s.prompt, type: s.type },
    })),
  );
  slides.forEach((s, i) => (s.historyId = slideIds[i] ?? null));
  return { theme: plan.theme, slides };
}
