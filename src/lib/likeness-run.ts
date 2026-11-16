import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { MEDIA_BUCKET, shrinkForVision, toDataUri } from "@/lib/images";
import { currentPack, selectCharacter } from "@/lib/sheet-pack";
import { saveHistory } from "@/lib/history";
import { adminClient } from "@/lib/supabase/admin";
import { getUserTextClient } from "@/lib/ai/text-client";
import { askJson } from "@/lib/ai/json";
import { profileBlock } from "@/lib/ai/tasks/profile-builder";
import {
  likenessReportPrompt,
  likenessReportText,
  parseLikenessReport,
  parseQuickLikeness,
  quickLikenessPrompt,
  type LikenessReport,
  type QuickLikeness,
} from "@/lib/ai/prompts/likeness";
import type { SheetPack } from "@/lib/ai/prompts/identity";
import type { CharacterProfile } from "@/lib/characters";

const GENERATIONS_BUCKET = "generations";

/** An image to check: a generated image (by its generation) or an uploaded one (by its storage path). */
export interface ImageSource {
  generationId?: string;
  path?: string;
}

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

const COLUMNS = "id, name, profile, always_keep, height, weight, face_sheet_path, body_sheet_path, reference_paths, sheet_pack";

async function download(supabase: SupabaseClient, bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new UserFacingError("Couldn't load the image. It may have expired.");
  return Buffer.from(await data.arrayBuffer());
}

/** Loads the image to check, shrunk for the vision model. */
export async function loadSource(supabase: SupabaseClient, userId: string, src: ImageSource, maxEdge: number): Promise<string> {
  if (src.generationId) {
    const { data } = await supabase.from("generations").select("output_path, status, params").eq("id", src.generationId).maybeSingle();
    if (data?.status === "complete" && !data.output_path && (data.params as { output_url?: string } | null)?.output_url)
      throw new UserFacingError("That image is still being saved. Try again in a few seconds.");
    if (!data?.output_path || data.status !== "complete") throw new UserFacingError("That image isn't ready, or has expired.");
    return toDataUri(await shrinkForVision(await download(supabase, GENERATIONS_BUCKET, data.output_path as string), maxEdge));
  }
  if (src.path && isOwnPath(userId, src.path)) return toDataUri(await shrinkForVision(await download(supabase, MEDIA_BUCKET, src.path), maxEdge));
  throw new UserFacingError("Add the image to check.");
}

/** Artifact likeRefBlobs: her crops (front, side, body, faces), else the whole sheet, else up to 3 photos, with roles. */
export function likenessRefs(c: Row, pack: SheetPack | null, cap: number): { path: string; role: string }[] {
  if (pack?.crops.length) {
    const order = ["front", "side", "body", "faces"];
    return pack.crops
      .slice()
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .slice(0, cap)
      .map((x) => ({ path: x.path, role: x.role }));
  }
  const sheet = c.body_sheet_path || c.face_sheet_path;
  if (sheet) return [{ path: sheet, role: "her character reference sheet" }];
  return c.reference_paths.slice(0, Math.min(3, cap)).map((path) => ({ path, role: "a reference photo of her" }));
}

const loadRefs = (supabase: SupabaseClient, refs: { path: string }[], maxEdge?: number) =>
  Promise.all(refs.map(async (r) => toDataUri(await shrinkForVision(await download(supabase, MEDIA_BUCKET, r.path), maxEdge))));

/**
 * One scoring pass per image: the quick check's result is kept on the generation, and the full report reads it, so the
 * badge under an image and the report on the Likeness page always show the same number.
 */
async function cachedQuick(supabase: SupabaseClient, userId: string, generationId: string, characterId: string): Promise<QuickLikeness | null> {
  const { data } = await supabase.from("generations").select("params").eq("id", generationId).eq("user_id", userId).maybeSingle();
  const l = (data?.params as { likeness?: { characterId?: string; result?: QuickLikeness } } | null)?.likeness;
  return l?.characterId === characterId && l.result && typeof l.result === "object" ? l.result : null;
}

async function storeQuick(userId: string, generationId: string, characterId: string, result: QuickLikeness): Promise<void> {
  try {
    const db = adminClient();
    const { data } = await db.from("generations").select("params").eq("id", generationId).eq("user_id", userId).maybeSingle();
    if (!data) return;
    await db.from("generations").update({ params: { ...((data.params as object | null) ?? {}), likeness: { characterId, result } } }).eq("id", generationId).eq("user_id", userId);
  } catch {
    // Best effort: without it the full report just runs the scoring pass itself.
  }
}

/**
 * The quick likeness score (artifact quickLike) for a generated image of her. With `original`, it is a fix being
 * checked: the original goes second to last and a verdict says whether the fix is closer to her.
 */
export async function runQuickLikeness(
  supabase: SupabaseClient,
  userId: string,
  input: { characterId: string; image: ImageSource; original?: ImageSource },
): Promise<QuickLikeness> {
  const c = await selectCharacter<Row>(supabase, input.characterId, COLUMNS);
  if (!c) throw new UserFacingError("Character not found.");
  const refs = likenessRefs(c, currentPack(c), 4);
  if (!refs.length) throw new UserFacingError("This character has no sheet or reference photos to compare against.");
  const cmp = !!(input.original && (input.original.generationId || input.original.path));
  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "likeness");
  const edge = (n: number) => Math.min(n, imageMaxEdge ?? n);
  const [refUris, orig, gen] = await Promise.all([
    loadRefs(supabase, refs, imageMaxEdge),
    cmp ? loadSource(supabase, userId, input.original!, edge(768)) : null,
    loadSource(supabase, userId, input.image, edge(1024)),
  ]);
  const reply = await askJson(client, { prompt: quickLikenessPrompt(refs.map((r) => r.role), cmp), images: [...refUris, ...(orig ? [orig] : []), gen] });
  const result = parseQuickLikeness(reply, cmp);
  if (input.image.generationId) await storeQuick(userId, input.image.generationId, input.characterId, result);
  return result;
}

/** The full likeness report (artifact checkLikeness), saved to History as a round. */
export async function runLikenessReport(
  supabase: SupabaseClient,
  userId: string,
  input: { characterId: string; image: ImageSource; promptUsed?: string },
): Promise<LikenessReport> {
  const c = await selectCharacter<Row>(supabase, input.characterId, COLUMNS);
  if (!c) throw new UserFacingError("Character not found.");
  // Her saved sheet, as the artifact fills it in; with no sheet, her reference photos.
  const sheet = c.body_sheet_path || c.face_sheet_path;
  const refPaths = sheet ? [sheet] : c.reference_paths.slice(0, 3);
  if (!refPaths.length) throw new UserFacingError("Add a reference sheet or save reference photos on this character.");
  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "likeness");
  const [refUris, gen] = await Promise.all([
    loadRefs(supabase, refPaths.map((path) => ({ path })), imageMaxEdge),
    loadSource(supabase, userId, input.image, Math.min(1280, imageMaxEdge ?? 1280)),
  ]);
  const used = String(input.promptUsed ?? "").trim();
  // The one scoring pass: reuse the quick score already made for this image, or make it now.
  const anchor =
    (input.image.generationId ? await cachedQuick(supabase, userId, input.image.generationId, c.id) : null) ??
    (await runQuickLikeness(supabase, userId, { characterId: c.id, image: input.image }).catch(() => null));
  const prompt = likenessReportPrompt({ profile: profileBlock({ ...c, profile: c.profile ?? {} }), refCount: refUris.length, isSheet: !!sheet, used, anchor: anchor ?? undefined });
  const report = parseLikenessReport(await askJson(client, { prompt, images: [...refUris, gen] }));
  if (anchor?.score != null) report.overall = anchor.score;
  await saveHistory(supabase, userId, [
    {
      characterId: c.id,
      kind: "likeness",
      label: `Likeness · ${c.name} · ${report.overall}/100`,
      prompt: likenessReportText(report),
      imagePath: input.image.path ?? null,
    },
  ]);
  return report;
}
