import "server-only";
import { identityBlock } from "@/lib/ai/prompts/lean";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { loadForVision } from "@/lib/character-images";
import { ensureSheetPack, selectCharacter } from "@/lib/sheet-pack";
import { saveHistory } from "@/lib/history";
import { recentPoses, rememberPoses, RECENT_SEND } from "@/lib/recent-poses";
import { getUserTextClient } from "@/lib/ai/text-client";
import { harness } from "@/lib/ai/prompts/harness";
import { sheetLines } from "@/lib/ai/prompts/identity";
import { DECLINED_MESSAGE } from "@/lib/ai/refusal";
import { buildInjectPrompt, looksLikeRefusal, parseVersions, TWO_SHEET_OPENER, type InjectOptions, type VersionPlan } from "@/lib/ai/prompts/inject";
import { buildSwapBriefPrompt, swapChange } from "@/lib/ai/prompts/swap-brief";
import { leanSwap } from "@/lib/ai/prompts/swap";
import { leanSwapOptions, sheetRefs } from "@/lib/generation-job";
import { HAIRSTYLES, PALETTES, POSE_HINTS, SOCIAL_POSES, shuffleArr } from "@/lib/ai/prompts/pools";
import { injectOptionsSchema, type InjectMeta, type InjectOptionsInput } from "@/lib/inject-meta";
import type { CharacterProfile } from "@/lib/characters";

/** The target is sent to the prompt writer at this size (artifact: 1024). */
const TARGET_EDGE = 1024;

export interface InjectVersion {
  /** The finished prompt, after the harness. */
  text: string;
  /** What the harness fixed; empty means all checks passed. */
  fixed: string[];
  /** Card tags: the pose, new outfit, colours, hairstyle. */
  tags: string[];
  /** What Generate needs to frame it (the target is added by the browser in Edit this photo mode (Recreate is the default)). */
  meta: InjectMeta;
  /** Its History entry, so an image made from it can be found again ("Preview generation"). */
  historyId?: string | null;
}

export type InjectRunResult = { versions: (InjectVersion | null)[]; truncated: boolean; characterName: string };

interface Row {
  id: string;
  name: string;
  profile: CharacterProfile | null;
  always_keep: string | null;
  height: string | null;
  weight: string | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
  sheet_pack?: unknown;
}

/**
 * Writes the Inject versions for one target (artifact genTarget): one call with every version in it, then the harness
 * on each, history, and the poses remembered so the next run doesn't repeat them.
 */
export async function runInject(
  supabase: SupabaseClient,
  userId: string,
  input: { characterId: string; targetPath: string; options: InjectOptionsInput },
  random: () => number = Math.random,
  /** Each piece of the reply as the model writes it (the streaming route shows it live). */
  onDelta?: (text: string) => void,
): Promise<InjectRunResult> {
  if (!isOwnPath(userId, input.targetPath)) throw new UserFacingError("That image couldn't be used. Upload it again.");
  const parsed = injectOptionsSchema.safeParse(input.options ?? {});
  if (!parsed.success) throw new UserFacingError("Those options weren't valid. Refresh the page and try again.");
  const opt = parsed.data;

  const c = await selectCharacter<Row>(
    supabase,
    input.characterId,
    "id, name, profile, always_keep, height, weight, face_sheet_path, body_sheet_path, reference_paths, sheet_pack",
  );
  if (!c) throw new UserFacingError("Character not found.");

  const o: InjectOptions = {
    mode: opt.mode,
    len: opt.len,
    ward: opt.ward,
    who: opt.who,
    extra: opt.extra,
    tag: opt.tag || "@image1",
    // The default tag with both sheets: the prompt names both, as Generate here and Write only send them.
    twoSheets: opt.mode === "ref" && (opt.tag || "@image1") === "@image1" && !!c.face_sheet_path && !!c.body_sheet_path,
    exText: opt.exText,
    poseMode: opt.poseMode,
    pose: opt.poseMode !== "keep",
    count: opt.count,
    // A new outfit replaces the clothes, so there is nothing to recolour.
    recolor: opt.recolor && !opt.newOutfit,
    hair: opt.hair,
    newOutfit: opt.newOutfit,
    clean: opt.clean,
  };

  const { client, imageMaxEdge, model } = await getUserTextClient(supabase, userId, "vision", "prompt");
  // Her sheet's words go in as the source of truth; the sheet is read once on first use.
  const pack = await ensureSheetPack(supabase, userId, c);
  // With a read sheet, her look is one fixed block the app adds: the writer leaves it out, so it never varies.
  o.fixedIdentity = o.mode === "ref" && !!identityBlock(pack?.anchors);

  const pals = shuffleArr(PALETTES, random);
  const hs = shuffleArr(HAIRSTYLES, random);
  const plans: VersionPlan[] = Array.from({ length: o.count }, (_, k) => ({ palette: pals[k], hair: hs[k] }));
  const recent = o.pose && !opt.swap ? (await recentPoses(supabase, userId)).poses.slice(-RECENT_SEND) : [];
  const inspo = o.pose ? shuffleArr(o.poseMode === "social" ? SOCIAL_POSES : [...POSE_HINTS, ...SOCIAL_POSES], random).slice(0, 6) : [];

  const refPaths = opt.withRefs ? c.reference_paths.slice(0, 3) : [];
  const [target] = await loadForVision(supabase, [{ label: "target", path: input.targetPath }], Math.min(TARGET_EDGE, imageMaxEdge ?? TARGET_EDGE));
  const refs = await loadForVision(supabase, refPaths.map((path) => ({ label: "reference photo", path })), imageMaxEdge);

  if (opt.swap) o.fixedIdentity = false;
  const prompt = opt.swap
    ? buildSwapBriefPrompt(o, plans.length)
    : buildInjectPrompt({ ...c, profile: c.profile ?? {} }, sheetLines(pack), o, plans, refs.length, recent, inspo);
  const task = { prompt, images: [target, ...refs].map((x) => x.dataUri) };
  const reply = client.complete ? await client.complete(task, { onDelta, stopOnRefusal: true }) : { text: await client.run(task), truncated: false };

  const readReply = (text: string) => parseVersions(text).map((v) => (looksLikeRefusal(v.text) ? { ...v, text: "" } : v));
  let parsedVersions = readReply(reply.text);
  let truncated = reply.truncated;
  let declined = looksLikeRefusal(reply.text);
  if (!parsedVersions.some((v) => v.text) && declined) {
    // The reading model declined: the person's other (Text) model writes it from the same photo and instructions, so the
    // outfit, pose and scene come from a model that will, instead of from nothing. Skipped when it is the same model.
    try {
      const alt = await getUserTextClient(supabase, userId, "llm", "prompt");
      if (alt.model !== model) {
        const second = await alt.client.run(task);
        parsedVersions = readReply(second);
        truncated = false;
        declined = !parsedVersions.some((v) => v.text) && looksLikeRefusal(second);
      }
    } catch {
      // The second model couldn't read the photo or failed; the message below says what to do.
    }
  }
  if (!parsedVersions.some((v) => v.text))
    throw new UserFacingError(
      declined ? DECLINED_MESSAGE : "The model did not write a prompt. Try again.",
    );
  const chg = { pose: o.pose, outfit: o.newOutfit || o.recolor || o.ward === "extracted" || o.ward === "signature", hair: o.hair, who: o.who };
  const versions = plans.map((plan, i): InjectVersion | null => {
    const v = parsedVersions[i];
    if (!v || !v.text) return null;
    if (opt.swap) {
      // Swap into photo: the prompt is the lean recipe itself, exactly what Generate sends with the target as the last image.
      // The reader's short paragraph goes in as written; outfit, colour and hair options are the app's own Change line.
      const scene = [v.camera, v.pose, v.text].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 900);
      const meta: InjectMeta = { brief: true, scene, edit: swapChange(o, plan), chg, ...(o.clean ? { clean: true } : {}) };
      const tags = [o.pose && "New pose", o.newOutfit && "New outfit", o.recolor && "Colours: " + plan.palette, o.hair && "Hair: " + plan.hair].filter((x): x is string => !!x);
      return { text: leanSwap(sheetRefs(c, pack, 2, 3).R, leanSwapOptions(meta)), fixed: [], tags, meta };
    }
    const h = harness(o.twoSheets ? withBothSheets(v.text) : v.text, { tag: o.mode === "ref" ? o.tag : "", stripAR: o.len === "full" });
    if (o.fixedIdentity) h.text = withIdentityBlock(h.text, identityBlock(pack?.anchors, v.frame));
    const tags = [v.pose ? "Pose: " + v.pose : o.pose && "New pose", o.newOutfit && "New outfit", o.recolor && "Colours: " + plan.palette, o.hair && "Hair: " + plan.hair].filter(
      (x): x is string => !!x,
    );
    return { text: h.text, fixed: h.fixed, tags, meta: { edit: v.edit, frame: v.frame, outfit: v.outfit, chg, ...(o.clean ? { clean: true } : {}) } };
  });

  const historyIds = await saveHistory(
    supabase,
    userId,
    versions.flatMap((v, i) =>
      v
        ? [
            {
              characterId: c.id,
              kind: "inject" as const,
              label: `Inject · ${c.name}${o.count > 1 ? ` · version ${i + 1}` : ""}${v.tags.length ? ` · ${v.tags.join(" · ")}` : ""}`,
              prompt: v.text,
              imagePath: input.targetPath,
              meta: v.meta,
            },
          ]
        : [],
    ),
  );
  let k = 0;
  for (const v of versions) if (v) v.historyId = historyIds[k++] ?? null;
  if (!opt.swap) await rememberPoses(supabase, userId, parsedVersions.map((v) => v.pose).filter(Boolean));
  return { versions, truncated, characterName: c.name };
}

/**
 * Puts her fixed identity block in its own paragraph, right after the opening sentence. Generate and Write only move it
 * to the top of their framing (framePrompt), so it is said once either way.
 */
export function withIdentityBlock(text: string, block: string): string {
  if (!block || text.includes(block)) return text;
  const m = /^\s*(?:Use|Using)\s[^.]*?identity\s+reference\.\s*/i.exec(text);
  return m ? `${m[0].trim()}\n\n${block}\n\n${text.slice(m[0].length).trim()}` : `${block}\n\n${text.trim()}`;
}

/** A prompt that still opens on @image1 alone gets the two-sheet opener, and its body line points at @image2. */
export function withBothSheets(text: string): string {
  let t = text.trim();
  if (!t.includes("@image2")) {
    const single = /^\s*(?:Use|Using)\s+@image1(?:\s*\([^)]*\))?\s+as\s+the\s+(?:strict\s+)?identity\s+reference\.?\s*/i;
    t = single.test(t) ? t.replace(single, TWO_SHEET_OPENER + " ") : TWO_SHEET_OPENER + " " + t;
    t = t.replace(/\b(body must match) the reference exactly\b/i, "$1 @image2 exactly");
  }
  return t;
}
