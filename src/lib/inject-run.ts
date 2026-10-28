import "server-only";
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
import { buildInjectPrompt, parseVersions, type InjectOptions, type VersionPlan } from "@/lib/ai/prompts/inject";
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
  /** What Generate needs to frame it (the target is added by the browser when "Edit the target photo" is on). */
  meta: InjectMeta;
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

  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "prompt");
  // Her sheet's words go in as the source of truth; the sheet is read once on first use.
  const pack = await ensureSheetPack(supabase, userId, c);

  const pals = shuffleArr(PALETTES, random);
  const hs = shuffleArr(HAIRSTYLES, random);
  const plans: VersionPlan[] = Array.from({ length: o.count }, (_, k) => ({ palette: pals[k], hair: hs[k] }));
  const recent = o.pose ? (await recentPoses(supabase, userId)).poses.slice(-RECENT_SEND) : [];
  const inspo = o.pose ? shuffleArr(o.poseMode === "social" ? SOCIAL_POSES : [...POSE_HINTS, ...SOCIAL_POSES], random).slice(0, 6) : [];

  const refPaths = opt.withRefs ? c.reference_paths.slice(0, 3) : [];
  const [target] = await loadForVision(supabase, [{ label: "target", path: input.targetPath }], Math.min(TARGET_EDGE, imageMaxEdge ?? TARGET_EDGE));
  const refs = await loadForVision(supabase, refPaths.map((path) => ({ label: "reference photo", path })), imageMaxEdge);

  const prompt = buildInjectPrompt({ ...c, profile: c.profile ?? {} }, sheetLines(pack), o, plans, refs.length, recent, inspo);
  const task = { prompt, images: [target, ...refs].map((x) => x.dataUri) };
  const reply = client.complete ? await client.complete(task) : { text: await client.run(task), truncated: false };

  const parsedVersions = parseVersions(reply.text);
  const chg = { pose: o.pose, outfit: o.newOutfit || o.recolor || o.ward === "extracted" || o.ward === "signature", hair: o.hair, who: o.who };
  const versions = plans.map((plan, i): InjectVersion | null => {
    const v = parsedVersions[i];
    if (!v || !v.text) return null;
    const h = harness(v.text, { tag: o.mode === "ref" ? o.tag : "", stripAR: o.len === "full" });
    const tags = [v.pose ? "Pose: " + v.pose : o.pose && "New pose", o.newOutfit && "New outfit", o.recolor && "Colours: " + plan.palette, o.hair && "Hair: " + plan.hair].filter(
      (x): x is string => !!x,
    );
    return { text: h.text, fixed: h.fixed, tags, meta: { edit: v.edit, frame: v.frame, outfit: v.outfit, chg, ...(o.clean ? { clean: true } : {}) } };
  });

  await saveHistory(
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
  await rememberPoses(supabase, userId, parsedVersions.map((v) => v.pose).filter(Boolean));
  return { versions, truncated: reply.truncated, characterName: c.name };
}
