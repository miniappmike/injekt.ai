import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { referencesFor } from "@/lib/character-images";
import { currentPack, ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { getUserTextClient } from "@/lib/ai/text-client";
import { basePrompt, clampTags, condenseTask, fitCrops, framePrompt, lockRefs, modelFamily, outfitLock, type RefSet, type SheetPack } from "@/lib/ai/prompts/identity";
import { OVERLAY_RULE } from "@/lib/ai/prompts/rules";

/** The image provider's prompt limit; longer prompts are condensed by the person's own text model. */
export const PROMPT_LIMIT = 5000;

/**
 * What an Inject prompt carries besides its text, so the server can frame it for the image model. With a target the
 * job is a photo edit: the target photo plus her references, and only the short EDIT line as the change.
 */
export const injectMetaSchema = z.object({
  /** The target photo, when it may be sent to the image model. */
  target: z.string().max(300).optional(),
  edit: z.string().max(600).optional(),
  frame: z.string().max(200).optional(),
  outfit: z.string().max(300).optional(),
  clean: z.boolean().optional(),
  chg: z
    .object({ pose: z.boolean().optional(), outfit: z.boolean().optional(), hair: z.boolean().optional(), who: z.string().max(200).optional() })
    .optional(),
});
export type InjectMeta = z.infer<typeof injectMetaSchema>;

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

  if (request.kind === "inject" && request.meta && c) {
    // A price check never pays to read the sheet; it uses the pack only if one is already saved.
    const pack = opts.forQuote ? currentPack(c) : await ensureSheetPack(supabase, userId, c);
    return injectJob(c, pack, request.prompt, request.meta, opts.model, opts.max);
  }

  const paths: string[] = [];
  // A reference sheet is made only from the pictures you give it, not from the character's existing references.
  if (c && request.kind !== "reference_sheet") paths.push(...referencesFor(request.kind, c).map((r) => r.path));
  paths.push(...request.extraPaths);
  return { prompt: request.prompt, paths, photoEdit: false };
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
