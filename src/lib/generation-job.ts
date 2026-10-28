import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import type { InjectMeta } from "@/lib/inject-meta";
import { isOwnPath } from "@/lib/uploads";
import { referencesFor } from "@/lib/character-images";
import { currentPack, ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { getUserTextClient } from "@/lib/ai/text-client";
import { basePrompt, clampTags, condenseTask, fitCrops, framePrompt, lockRefs, modelFamily, outfitLock, type RefSet, type SheetPack } from "@/lib/ai/prompts/identity";
import { OVERLAY_RULE } from "@/lib/ai/prompts/rules";
import { faceFixPrompt, likenessFixPrompt, type FixRefs } from "@/lib/ai/prompts/likeness";
import { carouselSlidePrompt } from "@/lib/ai/prompts/variants";
import { swapPrompt } from "@/lib/ai/prompts/swap";
import { asksMakeup, makeupRule } from "@/lib/ai/prompts/rules";

/** The image provider's prompt limit; longer prompts are condensed by the person's own text model. */
export const PROMPT_LIMIT = 5000;

/** A path in the generations bucket (a generated image used as an input), told apart from character media paths. */
export const GEN_PREFIX = "gen:";
/** Kinds whose prompt the server writes from meta; the browser's prompt text is only a label for them. */
export const SERVER_PROMPT_KINDS = ["likeness_fix", "face_fix", "direct_swap"] as const;

export interface JobCharacter {
  id: string;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
  sheet_pack?: unknown;
}

export interface BuiltJob {
  prompt: string;
  /** Storage paths, in @image order. */
  paths: string[];
  photoEdit: boolean;
}

/** Her references when there is no pack: the whole sheet (body sheet first), or up to 3 photos. */
function sheetFor(c: JobCharacter): { paths: string[]; isSheet: boolean } {
  const sheet = c.body_sheet_path || c.face_sheet_path;
  return sheet ? { paths: [sheet], isSheet: true } : { paths: c.reference_paths.slice(0, 3), isSheet: false };
}

/**
 * Artifact genJobFor: a photo edit when the target may be sent (her pack crops after the target, with basePrompt),
 * otherwise her references alone with the model's identity framing around the written scene.
 */
export function injectJob(c: JobCharacter, pack: SheetPack | null, text: string, meta: InjectMeta, model: string, max: number): BuiltJob {
  const chg = { ...meta.chg, outfitText: meta.outfit || "", clean: !!meta.clean };
  if (meta.target) {
    let R: RefSet;
    let paths: string[];
    if (pack?.crops.length) {
      const cr = fitCrops(pack.crops, max - 1);
      R = { roles: cr.map((x) => x.role), kinds: cr.map((x) => x.kind), anchors: pack.anchors };
      paths = cr.map((x) => x.path);
    } else {
      const s = sheetFor(c);
      paths = s.isSheet ? s.paths : s.paths.slice(0, Math.min(3, max - 1));
      R = { roles: paths.map(() => (s.isSheet ? "her character reference sheet" : "a reference photo of her")), kinds: [], anchors: null };
    }
    if (paths.length) return { prompt: basePrompt(R, meta.edit, meta.frame, chg), paths: [meta.target, ...paths], photoEdit: true };
  }
  if (pack?.crops.length) {
    const cr = fitCrops(pack.crops, max);
    const R: RefSet = { roles: cr.map((x) => x.role), kinds: cr.map((x) => x.kind), anchors: pack.anchors };
    return { prompt: framePrompt(modelFamily(model), text, R, meta.frame, { outfit: meta.outfit, clean: meta.clean }), paths: cr.map((x) => x.path), photoEdit: false };
  }
  const s = sheetFor(c);
  const paths = s.paths.slice(0, max);
  if (!paths.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  const n = paths.length;
  const ol = outfitLock(n > 1 ? "the reference images" : "@image1", meta.outfit, "", "prompt") + (meta.clean ? " " + OVERLAY_RULE : "");
  return { prompt: lockRefs(text, n, s.isSheet, ol), paths, photoEdit: false };
}

/** Artifact fixParts references: every pack crop, else the whole sheet, else 2 reference photos. */
export function fixRefs(c: JobCharacter, pack: SheetPack | null, max: number): { paths: string[]; R: FixRefs } {
  if (pack?.crops.length) {
    const cr = fitCrops(pack.crops, max);
    return { paths: cr.map((x) => x.path), R: { roles: cr.map((x) => x.role), kinds: cr.map((x) => x.kind), anchors: pack.anchors, usePack: true } };
  }
  const s = sheetFor(c);
  const paths = s.paths.slice(0, Math.min(s.isSheet ? 1 : 2, max));
  return { paths, R: { roles: paths.map(() => (s.isSheet ? "her character reference sheet" : "a reference photo of her")), kinds: [], anchors: null, usePack: false } };
}

/** Artifact faceRefs: her face crops, else the face sheet, else the body sheet (its face only), else 2 photos. */
export function faceRefs(c: JobCharacter, pack: SheetPack | null): { paths: string[]; roles: string[]; anchors: SheetPack["anchors"] | null } {
  const anchors = pack?.anchors ?? null;
  const f = pack?.crops.filter((x) => x.kind === "front" || x.kind === "faces") ?? [];
  if (f.length) return { paths: f.map((x) => x.path), roles: f.map((x) => x.role), anchors };
  if (c.face_sheet_path) return { paths: [c.face_sheet_path], roles: ["her face reference sheet, a grid of her face from many angles"], anchors };
  if (c.body_sheet_path) return { paths: [c.body_sheet_path], roles: ["her character reference sheet (use only her face from it)"], anchors };
  const refs = c.reference_paths.slice(0, 2);
  return { paths: refs, roles: refs.map(() => "a reference photo of her face"), anchors: null };
}

/** A likeness fix or face fix: the image to repaint is @image1, her references follow. */
export function fixJob(kind: "likeness_fix" | "face_fix", c: JobCharacter, pack: SheetPack | null, source: string, meta: InjectMeta, model: string, max: number): BuiltJob {
  if (kind === "face_fix") {
    const F = faceRefs(c, pack);
    if (!F.paths.length) throw new UserFacingError("This character has no sheet or reference photos to fix against.");
    const paths = F.paths.slice(0, max - 1);
    return { prompt: faceFixPrompt({ roles: F.roles.slice(0, paths.length), anchors: F.anchors }, { hair: !!meta.matchHair, note: meta.note }), paths: [source, ...paths], photoEdit: true };
  }
  const { paths, R } = fixRefs(c, pack, max - 1);
  if (!paths.length) throw new UserFacingError("This character has no sheet or reference photos to fix against.");
  return { prompt: likenessFixPrompt(R, meta.fixes ?? [], meta.frame, modelFamily(model)), paths: [source, ...paths], photoEdit: true };
}

/**
 * A carousel slide (artifact carJob): her pack crops (or whole sheet) for slides with her, then the cover, then any
 * extra images; slides without her send only the cover and the extras.
 */
export function carouselJob(c: JobCharacter | null, pack: SheetPack | null, slidePrompt: string, person: "full" | "partial" | "none", cover: string, extras: string[], max: number): BuiltJob {
  let paths: string[] = [];
  let roles: string[] = [];
  if (c && person !== "none") {
    if (pack?.crops.length) {
      const cr = fitCrops(pack.crops, Math.max(1, max - 1 - extras.length));
      paths = cr.map((x) => x.path);
      roles = cr.map((x) => x.role);
    } else {
      const s = sheetFor(c);
      paths = s.paths.slice(0, 1);
      roles = paths.map(() => (s.isSheet ? "her character reference sheet" : "a reference photo of her"));
    }
  }
  const prompt = carouselSlidePrompt({ person, prompt: slidePrompt }, { roles, anchors: pack?.anchors ?? null }, extras.length);
  return { prompt, paths: [...paths, cover, ...extras], photoEdit: false };
}

/** Artifact swapRefs: every pack crop, else the whole sheet, else up to 2 reference photos. */
export function swapRefs(c: JobCharacter, pack: SheetPack | null, max: number): { paths: string[]; R: RefSet } {
  if (pack?.crops.length) {
    const cr = fitCrops(pack.crops, max);
    return { paths: cr.map((x) => x.path), R: { roles: cr.map((x) => x.role), kinds: cr.map((x) => x.kind), anchors: pack.anchors } };
  }
  const s = sheetFor(c);
  const paths = s.paths.slice(0, s.isSheet ? 1 : Math.min(2, max));
  return { paths, R: { roles: paths.map(() => (s.isSheet ? "her character reference sheet" : "a reference photo of her")), kinds: [], anchors: null } };
}

/** Direct swap: the target photo first, her references after it, and the artifact's fixed swap prompt. */
export function swapJob(c: JobCharacter, pack: SheetPack | null, target: string, meta: InjectMeta, max: number): BuiltJob {
  const { paths, R } = swapRefs(c, pack, max - 1);
  if (!paths.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  return { prompt: swapPrompt(R, { who: meta.who, extra: meta.extra, clean: meta.clean, plen: PROMPT_LIMIT }), paths: [target, ...paths], photoEdit: true };
}

/** A reference Edit mode can send: her pack crops, her sheets and her photos. */
export interface RefOption {
  id: string;
  label: string;
  role: string;
  path: string;
  kind?: string;
  /** Picked by default. */
  on: boolean;
}

const CROP_LABELS: Record<string, string> = { front: "Face close-up", faces: "Face angles", side: "Side profile", body: "Full body" };

/** Artifact edRefState: her crops (on by default), her sheets (on when there are no crops), her photos (on when nothing else). */
export function refOptions(c: JobCharacter, pack: SheetPack | null): RefOption[] {
  const crops = pack?.crops ?? [];
  const out: RefOption[] = crops.map((x) => ({ id: x.kind, label: CROP_LABELS[x.kind] ?? x.kind, role: x.role, path: x.path, kind: x.kind, on: true }));
  const sheetOn = !crops.length;
  if (c.face_sheet_path) out.push({ id: "face_sheet", label: "Face sheet", role: "her face reference sheet, a grid of her face from many angles", path: c.face_sheet_path, on: sheetOn });
  if (c.body_sheet_path) out.push({ id: "body_sheet", label: "Body sheet", role: "her character reference sheet", path: c.body_sheet_path, on: sheetOn });
  const photosOn = !crops.length && !c.face_sheet_path && !c.body_sheet_path;
  c.reference_paths.forEach((path, i) => out.push({ id: `photo${i + 1}`, label: `Photo ${i + 1}`, role: "a reference photo of her", path, on: photosOn }));
  return out;
}

/**
 * Edit: the person's own prompt. The target (if any) is @image1, then the references they picked, then their extra
 * images. The makeup rule is added when there is a target and the prompt doesn't ask for a makeup change.
 */
export function editJob(c: JobCharacter | null, pack: SheetPack | null, text: string, meta: InjectMeta, extras: string[], max: number): BuiltJob {
  const picked = new Set(meta.refs ?? []);
  const refs = c ? refOptions(c, pack).filter((o) => picked.has(o.id)) : [];
  const paths = [...(meta.target ? [meta.target] : []), ...refs.map((r) => r.path), ...extras];
  if (!paths.length) throw new UserFacingError("Add a target photo or pick at least one reference.");
  if (paths.length > max) throw new UserFacingError(`That's too many images (${max} at most).`);
  const t = text.trim();
  const prompt = meta.target && !asksMakeup(t) ? `${t.replace(/\s*$/, "")}${/[.!?]$/.test(t) ? " " : ". "}${makeupRule("@image1")}` : t;
  return { prompt, paths, photoEdit: !!meta.target };
}

export interface JobRequest {
  kind: string;
  characterId?: string | null;
  extraPaths: string[];
  prompt: string;
  meta?: InjectMeta;
}

/**
 * The prompt and images a generation sends. Inject with meta goes through the identity engine; everything else sends
 * the character's references (see referencesFor) and then the extra pictures, with the prompt as written.
 */
export async function buildJob(
  supabase: SupabaseClient,
  userId: string,
  request: JobRequest,
  opts: { model: string; max: number; forQuote?: boolean },
): Promise<BuiltJob> {
  for (const p of [...request.extraPaths, request.meta?.target].filter((x): x is string => !!x)) {
    if (!isOwnPath(userId, p)) throw new UserFacingError("One of the images couldn't be used. Upload it again.");
  }
  let c: JobCharacter | null = null;
  if (request.characterId) {
    c = await selectCharacter<JobCharacter>(supabase, request.characterId, "id, face_sheet_path, body_sheet_path, reference_paths, sheet_pack");
    if (!c) throw new UserFacingError("Character not found.");
  }

  // A price check never pays to read the sheet; it uses the pack only if one is already saved.
  const packOf = (ch: JobCharacter) => (opts.forQuote ? currentPack(ch) : ensureSheetPack(supabase, userId, ch));

  if (request.kind === "inject" && request.meta && c) return injectJob(c, await packOf(c), request.prompt, request.meta, opts.model, opts.max);

  if ((request.kind === "likeness_fix" || request.kind === "face_fix") && request.meta) {
    if (!c) throw new UserFacingError("Pick the character to fix the likeness against.");
    const source = request.meta.sourceGeneration ? await generationSource(supabase, request.meta.sourceGeneration) : request.extraPaths[0];
    if (!source) throw new UserFacingError("Add the image to fix.");
    return fixJob(request.kind, c, await packOf(c), source, request.meta, opts.model, opts.max);
  }
  if (request.kind === "likeness_fix") throw new UserFacingError("A likeness fix needs the image and the character to fix it against.");

  if (request.kind === "direct_swap" && request.meta?.target) {
    if (!c) throw new UserFacingError("Pick a character.");
    return swapJob(c, await packOf(c), request.meta.target, request.meta, opts.max);
  }

  if (request.kind === "edit" && request.meta) return editJob(c, c ? await packOf(c) : null, request.prompt, request.meta, request.extraPaths, opts.max);

  if (request.kind === "carousel" && request.meta?.person) {
    const [cover, ...extras] = request.extraPaths;
    if (!cover) throw new UserFacingError("Add the cover image.");
    const pack = c && request.meta.person !== "none" ? await packOf(c) : null;
    return carouselJob(c, pack, request.prompt, request.meta.person, cover, extras, opts.max);
  }

  const paths: string[] = [];
  // A reference sheet is made only from the pictures you give it, not from the character's existing references.
  if (c && request.kind !== "reference_sheet") paths.push(...referencesFor(request.kind, c).map((r) => r.path));
  paths.push(...request.extraPaths);
  return { prompt: request.prompt, paths, photoEdit: false };
}

/** A finished generated image the person owns, as an input path in the generations bucket. */
async function generationSource(supabase: SupabaseClient, generationId: string): Promise<string> {
  const { data } = await supabase.from("generations").select("output_path, status, expires_at").eq("id", generationId).maybeSingle();
  if (!data?.output_path || data.status !== "complete") throw new UserFacingError("That image isn't ready, or has expired.");
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) throw new UserFacingError("That image has expired.");
  return GEN_PREFIX + data.output_path;
}

/** Points tags at images that are sent and keeps the prompt within the provider's limit (artifact wsGenerate). */
export async function fitPrompt(supabase: SupabaseClient, userId: string, prompt: string, imageCount: number, { forQuote = false } = {}): Promise<string> {
  const t = clampTags(prompt, imageCount);
  if (t.length <= PROMPT_LIMIT || forQuote) return t.slice(0, PROMPT_LIMIT);
  try {
    const { client } = await getUserTextClient(supabase, userId, "llm", "condense");
    const out = String(await client.run({ prompt: condenseTask(t, PROMPT_LIMIT) })).trim();
    if (out && out.length <= PROMPT_LIMIT) return clampTags(out, imageCount);
  } catch {
    // No text model, or it failed: cut it to length instead.
  }
  return t.slice(0, PROMPT_LIMIT);
}
