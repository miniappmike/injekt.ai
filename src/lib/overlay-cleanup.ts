import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";
import { MEDIA_BUCKET, shrinkForVision, toDataUri } from "@/lib/images";
import { finalPath, isOwnPath } from "@/lib/uploads";
import { getUserTextClient } from "@/lib/ai/text-client";
import { askJson } from "@/lib/ai/json";
import { DETECT_OVERLAYS_PROMPT, fillPatch, parseOverlays, planClean } from "@/lib/ai/prompts/cleanup";

export interface CleanResult {
  /** The cleaned copy, or the same path when nothing was found. The original is kept. */
  path: string;
  removed: string[];
}

/** Cleans app UI, watermarks and stickers off a target photo (artifact detectOverlays + cleanImage). */
export async function cleanTarget(supabase: SupabaseClient, userId: string, path: string, random: () => number = Math.random): Promise<CleanResult> {
  if (!isOwnPath(userId, path)) throw new UserFacingError("That image couldn't be used. Upload it again.");
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
  if (error || !data) throw new UserFacingError("Couldn't load the image. Upload it again.");
  const original = Buffer.from(await data.arrayBuffer());

  const { client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "cleanup");
  const small = await shrinkForVision(original, Math.min(1024, imageMaxEdge ?? 1024));
  const { ovs, person } = parseOverlays(await askJson(client, { prompt: DETECT_OVERLAYS_PROMPT, images: [toDataUri(small)] }));
  if (!ovs.length) return { path, removed: [] };

  const plan = planClean(ovs, person);
  const img = sharp(original).rotate().removeAlpha();
  const { width: W = 0, height: H = 0 } = await img.metadata();
  if (!W || !H) return { path, removed: [] };
  const [c0, c1, c2, c3] = plan.crop;
  const sx = Math.min(W - 16, Math.round(c0 * W));
  const sy = Math.min(H - 16, Math.round(c1 * H));
  const cw = Math.min(W - sx, Math.max(16, Math.round((c2 - c0) * W)));
  const ch = Math.min(H - sy, Math.max(16, Math.round((c3 - c1) * H)));
  const { data: raw } = await sharp(original).rotate().removeAlpha().extract({ left: sx, top: sy, width: cw, height: ch }).raw().toBuffer({ resolveWithObject: true });
  const patched: string[] = [];
  for (const o of plan.patches) {
    const [b0, b1, b2, b3] = o.box;
    const x0 = b0 * W - sx;
    const y0 = b1 * H - sy;
    const x1 = b2 * W - sx;
    const y1 = b3 * H - sy;
    if (x1 <= 0 || y1 <= 0 || x0 >= cw || y0 >= ch) continue;
    // Patches bigger than 12% of the picture would look painted; those are left for the prompt to ignore.
    if ((x1 - x0) * (y1 - y0) > cw * ch * 0.12) continue;
    if (fillPatch(raw, cw, ch, x0, y0, x1, y1, random)) patched.push(o.what);
  }
  const removed = [...new Set([...plan.removed, ...patched])];
  if (!removed.length) return { path, removed: [] };

  const out = await sharp(raw, { raw: { width: cw, height: ch, channels: 3 } }).jpeg({ quality: 93 }).toBuffer();
  const cleanPath = finalPath(userId, "targets");
  const up = await supabase.storage.from(MEDIA_BUCKET).upload(cleanPath, out, { contentType: "image/jpeg" });
  if (up.error) throw new UserFacingError("Couldn't save the cleaned image. Try again.");
  return { path: cleanPath, removed };
}
