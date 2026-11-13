import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import type { InjectMeta } from "@/lib/inject-meta";
import { isOwnPath } from "@/lib/uploads";
import { referencesFor } from "@/lib/character-images";
import { currentPack, ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { getUserTextClient } from "@/lib/ai/text-client";
import { basePrompt, clampTags, condenseTask, framePrompt, sceneCondenseTask, lockRefs, modelFamily, outfitLock, type RefSet, type SheetPack } from "@/lib/ai/prompts/identity";
import { OVERLAY_RULE } from "@/lib/ai/prompts/rules";
import { faceFixPrompt, likenessFixPrompt, type FixRefs } from "@/lib/ai/prompts/likeness";
import { carouselSlidePrompt } from "@/lib/ai/prompts/variants";
import { swapPrompt } from "@/lib/ai/prompts/swap";
import { sheetPrompts } from "@/lib/ai/prompts/sheets";
import { MAX_BODY_PHOTOS } from "@/lib/sheet-options";
import { asksMakeup, makeupRule } from "@/lib/ai/prompts/rules";
import { artToRealPrompt } from "@/lib/ai/prompts/art-to-real";
import { groupPhotoPrompt, MAX_GROUP, MIN_GROUP, type GroupMember } from "@/lib/ai/prompts/group";

/** The image provider's prompt limit; longer prompts are condensed by the person's own text model. */
export const PROMPT_LIMIT = 5000;

/** A path in the generations bucket (a generated image used as an input), told apart from character media paths. */
export const GEN_PREFIX = "gen:";
/** Kinds whose prompt the server writes from meta; the browser's prompt text is only a label for them. */
export const SERVER_PROMPT_KINDS = ["likeness_fix", "face_fix", "direct_swap", "reference_sheet"] as const;

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

export const FACE_SHEET_ROLE = "her face reference sheet, a grid of her face from many angles";
export const BODY_SHEET_ROLE = "her full-body reference sheet, front, side and back views";

/**
 * The image model's references for her: her two reference sheets, face sheet then body sheet (never the crops cut
 * from them), with her look in words from the sheet pack. Without a sheet, up to `photos` reference photos.
 */
export function sheetRefs(c: JobCharacter, pack: SheetPack | null, max: number, photos = 2): { paths: string[]; R: RefSet; isSheet: boolean } {
  const sheets = [
    c.face_sheet_path ? { path: c.face_sheet_path, role: FACE_SHEET_ROLE, kind: "faces" } : null,
    c.body_sheet_path ? { path: c.body_sheet_path, role: BODY_SHEET_ROLE, kind: "body" } : null,
  ]
    .filter((x): x is { path: string; role: string; kind: string } => !!x)
    .slice(0, Math.max(0, max));
  if (sheets.length) return { paths: sheets.map((x) => x.path), R: { roles: sheets.map((x) => x.role), kinds: sheets.map((x) => x.kind), anchors: pack?.anchors ?? null }, isSheet: true };
  const ph = c.reference_paths.slice(0, Math.max(0, Math.min(photos, max)));
  return { paths: ph, R: { roles: ph.map(() => "a reference photo of her"), kinds: [], anchors: null }, isSheet: false };
}

/**
 * Artifact genJobFor: a photo edit when the target may be sent (her sheets after the target, with basePrompt),
 * otherwise her sheets alone with the model's identity framing around the written scene.
 */
export function injectJob(c: JobCharacter, pack: SheetPack | null, text: string, meta: InjectMeta, model: string, max: number): BuiltJob {
  const chg = { ...meta.chg, outfitText: meta.outfit || "", clean: !!meta.clean };
  if (meta.target) {
    const s = sheetRefs(c, pack, max - 1, 3);
    if (s.paths.length) return { prompt: basePrompt(s.R, meta.edit, meta.frame, chg), paths: [meta.target, ...s.paths], photoEdit: true };
  }
  const s = sheetRefs(c, pack, max, 3);
  if (!s.paths.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  if (s.isSheet) return { prompt: framePrompt(modelFamily(model), text, s.R, meta.frame, { outfit: meta.outfit, clean: meta.clean }), paths: s.paths, photoEdit: false };
  const n = s.paths.length;
  const ol = outfitLock(n > 1 ? "the reference images" : "@image1", meta.outfit, "", "prompt") + (meta.clean ? " " + OVERLAY_RULE : "");
  return { prompt: lockRefs(text, n, false, ol), paths: s.paths, photoEdit: false };
}

/** A likeness fix's references: her two sheets (her look in words from the pack), else 2 reference photos. */
export function fixRefs(c: JobCharacter, pack: SheetPack | null, max: number): { paths: string[]; R: FixRefs } {
  const s = sheetRefs(c, pack, max);
  return { paths: s.paths, R: { ...s.R, usePack: s.isSheet && !!s.R.anchors } };
}

/** A face fix's references: the face sheet, then the body sheet (its face only), else 2 photos of her face. */
export function faceRefs(c: JobCharacter, pack: SheetPack | null): { paths: string[]; roles: string[]; anchors: SheetPack["anchors"] | null } {
  const anchors = pack?.anchors ?? null;
  const out: { path: string; role: string }[] = [];
  if (c.face_sheet_path) out.push({ path: c.face_sheet_path, role: FACE_SHEET_ROLE });
  if (c.body_sheet_path) out.push({ path: c.body_sheet_path, role: out.length ? "her full-body reference sheet (for her face from other angles)" : "her character reference sheet (use only her face from it)" });
  if (out.length) return { paths: out.map((x) => x.path), roles: out.map((x) => x.role), anchors };
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
 * A carousel slide (artifact carJob): her sheets for slides with her, then the cover, then any extra images; slides
 * without her send only the cover and the extras.
 */
export function carouselJob(c: JobCharacter | null, pack: SheetPack | null, slidePrompt: string, person: "full" | "partial" | "none", cover: string, extras: string[], max: number): BuiltJob {
  let paths: string[] = [];
  let roles: string[] = [];
  if (c && person !== "none") {
    const s = sheetRefs(c, pack, Math.max(1, max - 1 - extras.length), 1);
    paths = s.paths;
    roles = s.R.roles;
  }
  const prompt = carouselSlidePrompt({ person, prompt: slidePrompt }, { roles, anchors: pack?.anchors ?? null }, extras.length);
  return { prompt, paths: [...paths, cover, ...extras], photoEdit: false };
}

/** Direct swap and Art to Real references: her two sheets, else up to 2 reference photos. */
export function swapRefs(c: JobCharacter, pack: SheetPack | null, max: number): { paths: string[]; R: RefSet } {
  const s = sheetRefs(c, pack, max);
  return { paths: s.paths, R: s.R };
}

/** Direct swap: the target photo first, her references after it, and the artifact's fixed swap prompt. */
export function swapJob(c: JobCharacter, pack: SheetPack | null, target: string, meta: InjectMeta, max: number): BuiltJob {
  const { paths, R } = swapRefs(c, pack, max - 1);
  if (!paths.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  return { prompt: swapPrompt(R, { who: meta.who, extra: meta.extra, clean: meta.clean, plen: PROMPT_LIMIT }), paths: [target, ...paths], photoEdit: true };
}

/** A reference Edit mode can send: her sheets and her photos. */
export interface RefOption {
  id: string;
  label: string;
  role: string;
  path: string;
  kind?: string;
  /** Picked by default. */
  on: boolean;
}

/** Edit's references: her two sheets (on by default), and her photos (on only when she has no sheet). */
export function refOptions(c: JobCharacter, _pack: SheetPack | null): RefOption[] {
  const out: RefOption[] = [];
  if (c.face_sheet_path) out.push({ id: "face_sheet", label: "Face sheet", role: FACE_SHEET_ROLE, path: c.face_sheet_path, kind: "faces", on: true });
  if (c.body_sheet_path) out.push({ id: "body_sheet", label: "Body sheet", role: BODY_SHEET_ROLE, path: c.body_sheet_path, kind: "body", on: true });
  const photosOn = !c.face_sheet_path && !c.body_sheet_path;
  c.reference_paths.forEach((path, i) => out.push({ id: `photo${i + 1}`, label: `Photo ${i + 1}`, role: "a reference photo of her", path, on: photosOn }));
  return out;
}

/**
 * Edit: the person's own prompt. The target (if any) is @image1, then the references they picked, then their extra
 * images. The makeup rule is added when there is a target and the prompt doesn't ask for a makeup change.
 */
export function editJob(c: JobCharacter | null, pack: SheetPack | null, text: string, meta: InjectMeta, extras: string[], max: number): BuiltJob {
  // No picks sent (the Likeness page's revised prompt): the references that are on by default.
  const refs = c ? refOptions(c, pack).filter((o) => (meta.refs ? meta.refs.includes(o.id) : o.on)) : [];
  const paths = [...(meta.target ? [meta.target] : []), ...refs.map((r) => r.path), ...extras];
  if (!paths.length) throw new UserFacingError("Add a target photo or pick at least one reference.");
  if (paths.length > max) throw new UserFacingError(`That's too many images (${max} at most).`);
  const t = text.trim();
  const prompt = meta.target && !asksMakeup(t) ? `${t.replace(/\s*$/, "")}${/[.!?]$/.test(t) ? " " : ". "}${makeupRule("@image1")}` : t;
  return { prompt, paths, photoEdit: !!meta.target };
}

/** A group photo member's references: only her reference sheets (face sheet, then body sheet), never her photos. */
export function groupRefs(c: JobCharacter): { paths: string[]; roles: string[] } {
  const out: { path: string; role: string }[] = [];
  if (c.face_sheet_path) out.push({ path: c.face_sheet_path, role: "her face reference sheet, a grid of her face from many angles" });
  if (c.body_sheet_path) out.push({ path: c.body_sheet_path, role: "her character reference sheet, her full body from several angles" });
  return { paths: out.map((x) => x.path), roles: out.map((x) => x.role) };
}

/**
 * Group photo: each character's reference sheets in turn (at most 2 each, so at most 8 images for 4 people), her look
 * in words from her read sheet pack, and the person's creative direction.
 */
export function groupJob(members: { c: JobCharacter & { name: string }; pack: SheetPack | null }[], direction: string, max: number): BuiltJob {
  if (members.length < MIN_GROUP || members.length > MAX_GROUP) throw new UserFacingError(`Pick ${MIN_GROUP} to ${MAX_GROUP} characters.`);
  const paths: string[] = [];
  const people: GroupMember[] = members.map(({ c, pack }) => {
    const r = groupRefs(c);
    if (!r.paths.length) throw new UserFacingError(`${c.name} needs a reference sheet first. Group photos use only reference sheets.`);
    paths.push(...r.paths);
    return { name: c.name, roles: r.roles, anchors: pack?.anchors ?? null };
  });
  if (paths.length > max) throw new UserFacingError(`That's too many images (${max} at most).`);
  return { prompt: groupPhotoPrompt(people, direction), paths, photoEdit: false };
}

/**
 * Art to Real: the artwork is @image1. With a character, her references follow (pack crops, else her sheet, else up to
 * 2 photos) and she becomes the woman in it. `direction` is the person's optional extra note.
 */
export function artToRealJob(c: JobCharacter | null, pack: SheetPack | null, artwork: string, direction: string | undefined, max: number): BuiltJob {
  if (!c) return { prompt: artToRealPrompt(null, direction), paths: [artwork], photoEdit: true };
  const { paths, R } = swapRefs(c, pack, max - 1);
  if (!paths.length) throw new UserFacingError("This character needs a reference sheet or photo first, or choose no character.");
  return { prompt: artToRealPrompt(R, direction), paths: [artwork, ...paths], photoEdit: true };
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

  if (request.kind === "group_photo") {
    const ids = [...new Set(request.meta?.group ?? [])];
    if (ids.length < MIN_GROUP) throw new UserFacingError(`Pick at least ${MIN_GROUP} characters for a group photo.`);
    const members = await Promise.all(
      ids.map(async (id) => {
        const ch = await selectCharacter<JobCharacter & { name: string }>(supabase, id, "id, name, face_sheet_path, body_sheet_path, reference_paths, sheet_pack");
        if (!ch) throw new UserFacingError("One of those characters couldn't be found.");
        return { c: ch, pack: await packOf(ch) };
      }),
    );
    return groupJob(members, request.prompt, opts.max);
  }

  if (request.kind === "art_to_real") {
    const artwork = request.extraPaths[0];
    if (!artwork) throw new UserFacingError("Add the artwork first.");
    return artToRealJob(c, c ? await packOf(c) : null, artwork, request.meta?.extra, opts.max);
  }

  if (request.kind === "inject" && request.meta && c) {
    const pack = await packOf(c);
    const job = injectJob(c, pack, request.prompt, request.meta, opts.model, opts.max);
    if (job.photoEdit || job.prompt.length <= PROMPT_LIMIT || opts.forQuote) return job;
    // Too long for the image model: shorten only the written scene, so her identity framing, both sheet tags and the
    // BODY LOCK go through whole instead of being condensed with everything else or cut off at the end.
    const scene = await shortenScene(supabase, userId, request.prompt, request.prompt.length - (job.prompt.length - PROMPT_LIMIT) - 120);
    return scene ? injectJob(c, pack, scene, request.meta, opts.model, opts.max) : job;
  }

  if ((request.kind === "likeness_fix" || request.kind === "face_fix") && request.meta) {
    if (!c) throw new UserFacingError("Pick the character to fix the likeness against.");
    const source = request.meta.sourceGeneration ? await generationSource(supabase, request.meta.sourceGeneration) : request.extraPaths[0];
    if (!source) throw new UserFacingError("Add the image to fix.");
    return fixJob(request.kind, c, await packOf(c), source, request.meta, opts.model, opts.max);
  }
  if (request.kind === "likeness_fix") throw new UserFacingError("A likeness fix needs the image and the character to fix it against.");

  if (request.kind === "reference_sheet" && request.meta?.sheet) {
    // @image1 is the face photo or face sheet (a sheet just made in step 1 can be used straight from Generated images).
    const sh = request.meta.sheet;
    const face = request.meta.sourceGeneration ? await generationSource(supabase, request.meta.sourceGeneration) : request.extraPaths[0];
    if (!face) throw new UserFacingError(sh.kind === "face" ? "Step 1 needs a face photo." : "Step 2 needs a face sheet or a face photo.");
    if (sh.kind === "face") return { prompt: sheetPrompts(false, false).face, paths: [face], photoEdit: false };
    const bodies = request.meta.sourceGeneration ? request.extraPaths : request.extraPaths.slice(1);
    if (!bodies.length) throw new UserFacingError("Step 2 needs at least one body photo.");
    if (bodies.length > MAX_BODY_PHOTOS) throw new UserFacingError(`Use at most ${MAX_BODY_PHOTOS} body photos.`);
    return { prompt: sheetPrompts(!!sh.hasSheet, bodies.length, sh).body, paths: [face, ...bodies], photoEdit: false };
  }

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
  const { data } = await supabase.from("generations").select("output_path, status, expires_at, params").eq("id", generationId).maybeSingle();
  if (data?.status === "complete" && !data.output_path && (data.params as { output_url?: string } | null)?.output_url)
    throw new UserFacingError("That image is still being saved. Try again in a few seconds.");
  if (!data?.output_path || data.status !== "complete") throw new UserFacingError("That image isn't ready, or has expired.");
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) throw new UserFacingError("That image has expired.");
  return GEN_PREFIX + data.output_path;
}

/** Points tags at images that are sent and keeps the prompt within the provider's limit (artifact wsGenerate). */
/** The scene text shortened to `max` characters by the person's text model, or null when it can't be. */
async function shortenScene(supabase: SupabaseClient, userId: string, text: string, max: number): Promise<string | null> {
  if (max < 800) return null;
  try {
    const { client } = await getUserTextClient(supabase, userId, "llm", "condense");
    const out = String(await client.run({ prompt: sceneCondenseTask(text, max) })).trim();
    return out && out.length < text.length ? out : null;
  } catch {
    return null;
  }
}

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
