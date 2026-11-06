import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { MEDIA_BUCKET, shrinkForVision, toDataUri } from "@/lib/images";
import { currentPack, selectCharacter } from "@/lib/sheet-pack";
import { saveHistory } from "@/lib/history";
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
    const { data } = await supabase.from("generations").select("output_path, status").eq("id", src.generationId).maybeSingle();
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
  return parseQuickLikeness(reply, cmp);
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
  const prompt = likenessReportPrompt({ profile: profileBlock({ ...c, profile: c.profile ?? {} }), refCount: refUris.length, isSheet: !!sheet, used });
  const report = parseLikenessReport(await askJson(client, { prompt, images: [...refUris, gen] }));
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
