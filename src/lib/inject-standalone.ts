import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { injectMetaSchema, type InjectMeta } from "@/lib/inject-meta";
import { basePrompt, framePrompt, lockRefs, outfitLock, type Anchors } from "@/lib/ai/prompts/identity";
import { OVERLAY_RULE } from "@/lib/ai/prompts/rules";
import { swapPrompt } from "@/lib/ai/prompts/swap";
import { PROMPT_LIMIT } from "@/lib/generation-job";
import { attachText, linkAttachItems, retag, standaloneRefs, tagItems, type AttachItem, type StandaloneRef } from "@/lib/standalone";
import { MAX_VERSIONS } from "@/lib/inject-meta";

export interface StandalonePrompt {
  copy: string;
  attach: string[];
  attachItems: AttachItem[];
}

/**
 * One Inject version as a finished prompt for another generator (Write only), framed the way Generate frames it but
 * with her sheets as the references, always first (face sheet @image1, body sheet @image2) so the person attaches the
 * images in one fixed order. With the target: the photo edit (her sheets, then the target, changing only the version's
 * EDIT line). Without: the written prompt from her sheets alone.
 */
export function injectStandalone(
  refs: StandaloneRef[],
  anchors: Anchors | null,
  text: string,
  meta: InjectMeta,
  target: { cleanedPath?: string } | null,
): StandalonePrompt {
  if (!refs.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  const R = { roles: refs.map((r) => r.role), kinds: refs.map((r) => r.kind), anchors };
  const refItems = refs.map((r) => ({ label: r.label, source: "ref" as const, path: r.path }));
  let copy: string;
  let items: Omit<AttachItem, "tag">[];
  if (target) {
    // The edit is written with the target as @image1 and her references after it; renumbered so her references lead.
    const n = refs.length;
    copy = retag(basePrompt(R, meta.edit, meta.frame, { ...meta.chg, outfitText: meta.outfit || "", clean: !!meta.clean }), [
      ...Array.from({ length: n }, (_, i) => i + 2),
      1,
    ]);
    // A cleaned target is a copy only the app has, so it gets a link to save it.
    const t = target.cleanedPath ? { label: "your target photo (cleaned copy)", path: target.cleanedPath } : { label: "your target photo" };
    items = [...refItems, { ...t, source: "target" }];
  } else {
    const sheets = refs.some((r) => r.kind !== "photo");
    copy = sheets
      ? framePrompt("pro", text, R, meta.frame, { outfit: meta.outfit, clean: meta.clean })
      : lockRefs(text, refs.length, false, outfitLock(refs.length > 1 ? "the reference images" : "@image1", meta.outfit, "", "prompt") + (meta.clean ? " " + OVERLAY_RULE : ""));
    items = refItems;
  }
  const attachItems = tagItems(items);
  return { copy, attach: attachText(attachItems), attachItems };
}

const inputSchema = z.object({
  characterId: z.string().uuid(),
  /** The photo the versions were written for; left out in Recreate (Edit this photo is off). */
  targetPath: z.string().max(400).nullish(),
  /** True when targetPath is the app's cleaned copy. */
  cleaned: z.boolean().optional(),
  versions: z.array(z.object({ text: z.string().max(20000), meta: injectMetaSchema })).min(1).max(MAX_VERSIONS),
});

/** Write only on the Inject page: every version of one target as a finished prompt, with what to attach. */
export async function runInjectStandalone(supabase: SupabaseClient, userId: string, raw: unknown): Promise<StandalonePrompt[]> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new UserFacingError("Those prompts couldn't be read. Write them again.");
  const input = parsed.data;
  if (input.targetPath && !isOwnPath(userId, input.targetPath)) throw new UserFacingError("That image couldn't be used. Upload it again.");
  const c = await selectCharacter<{ id: string; name: string; face_sheet_path: string | null; body_sheet_path: string | null; reference_paths: string[]; sheet_pack?: unknown }>(
    supabase,
    input.characterId,
    "id, name, face_sheet_path, body_sheet_path, reference_paths, sheet_pack",
  );
  if (!c) throw new UserFacingError("Character not found.");
  // Her sheet's words (hair, body, "not ..." guards) go in, as Generate adds them; read once and saved.
  const anchors = c.face_sheet_path || c.body_sheet_path ? ((await ensureSheetPack(supabase, userId, c))?.anchors ?? null) : null;
  const refs = standaloneRefs(c);
  const target = input.targetPath ? (input.cleaned ? { cleanedPath: input.targetPath } : {}) : null;
  const out = input.versions.map((v) => injectStandalone(refs, anchors, v.text, v.meta, target));
  await linkAttachItems(supabase, out.flatMap((x) => x.attachItems));
  return out;
}

/**
 * Direct swap as a prompt to paste (no AI call): the fixed swap prompt, renumbered so her sheets lead (@image1 face
 * sheet, @image2 body sheet) and the target photo comes last, the same order as every other Write only prompt.
 */
export function swapStandalone(refs: StandaloneRef[], anchors: Anchors | null, o: { who?: string; extra?: string }): StandalonePrompt {
  if (!refs.length) throw new UserFacingError("This character needs a reference sheet or photo first.");
  const R = { roles: refs.map((r) => r.role), kinds: refs.map((r) => r.kind), anchors };
  const n = refs.length;
  const copy = retag(swapPrompt(R, { who: o.who, extra: o.extra, plen: PROMPT_LIMIT }), [...Array.from({ length: n }, (_, i) => i + 2), 1]);
  const attachItems = tagItems([...refs.map((r) => ({ label: r.label, source: "ref" as const, path: r.path })), { label: "your target photo", source: "target" as const }]);
  return { copy, attach: attachText(attachItems), attachItems };
}

const swapSchema = z.object({ characterId: z.string().uuid(), who: z.string().max(200).optional(), extra: z.string().max(2000).optional() });

/** Direct swap, Write only: her sheets and the swap prompt, with what to attach. */
export async function runSwapStandalone(supabase: SupabaseClient, userId: string, raw: unknown): Promise<StandalonePrompt> {
  const parsed = swapSchema.safeParse(raw);
  if (!parsed.success) throw new UserFacingError("Pick a character first.");
  const c = await selectCharacter<{ id: string; name: string; face_sheet_path: string | null; body_sheet_path: string | null; reference_paths: string[]; sheet_pack?: unknown }>(
    supabase,
    parsed.data.characterId,
    "id, name, face_sheet_path, body_sheet_path, reference_paths, sheet_pack",
  );
  if (!c) throw new UserFacingError("Character not found.");
  const anchors = c.face_sheet_path || c.body_sheet_path ? ((await ensureSheetPack(supabase, userId, c))?.anchors ?? null) : null;
  const out = swapStandalone(standaloneRefs(c), anchors, { who: parsed.data.who?.trim() || undefined, extra: parsed.data.extra?.trim() || undefined });
  await linkAttachItems(supabase, out.attachItems);
  return out;
}
