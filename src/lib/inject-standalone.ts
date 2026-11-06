import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { injectMetaSchema, type InjectMeta } from "@/lib/inject-meta";
import { basePrompt, framePrompt, lockRefs, outfitLock, type Anchors } from "@/lib/ai/prompts/identity";
import { OVERLAY_RULE } from "@/lib/ai/prompts/rules";
import { attachText, linkAttachItems, standaloneRefs, tagItems, type AttachItem, type StandaloneRef } from "@/lib/standalone";
import { MAX_VERSIONS } from "@/lib/inject-meta";

export interface StandalonePrompt {
  copy: string;
  attach: string[];
  attachItems: AttachItem[];
}

/**
 * One Inject version as a finished prompt for another generator (Write only), framed the way Generate frames it but
 * with her sheets as the references. With the target: the photo edit (the target first, then her sheets, changing only
 * the version's EDIT line). Without: the written prompt from her sheets alone.
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
    copy = basePrompt(R, meta.edit, meta.frame, { ...meta.chg, outfitText: meta.outfit || "", clean: !!meta.clean });
    // A cleaned target is a copy only the app has, so it gets a link to save it.
    const t = target.cleanedPath ? { label: "your target photo (cleaned copy)", path: target.cleanedPath } : { label: "your target photo" };
    items = [{ ...t, source: "target" }, ...refItems];
  } else {
    const sheets = refs.some((r) => r.kind !== "photo");
    copy = sheets
      ? framePrompt("other", text, R, meta.frame, { outfit: meta.outfit, clean: meta.clean })
      : lockRefs(text, refs.length, false, outfitLock(refs.length > 1 ? "the reference images" : "@image1", meta.outfit, "", "prompt") + (meta.clean ? " " + OVERLAY_RULE : ""));
    items = refItems;
  }
  const attachItems = tagItems(items);
  return { copy, attach: attachText(attachItems), attachItems };
}

const inputSchema = z.object({
  characterId: z.string().uuid(),
  /** The photo the versions were written for; left out when "Edit the target photo" is off. */
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
