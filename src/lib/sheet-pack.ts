import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, shrinkForVision, toDataUri } from "@/lib/images";
import { finalPath, isOwnPath } from "@/lib/uploads";
import { ApiKeyRequiredError } from "@/lib/errors";
import { getUserTextClient } from "@/lib/ai/text-client";
import { askJson } from "@/lib/ai/json";
import {
  ANALYZE_SHEET_PROMPT,
  cropRect,
  mergeAnalyses,
  PACK_V,
  parseSheetAnalysis,
  planCrops,
  type PackCrop,
  type SheetAnalysis,
  type SheetPack,
} from "@/lib/ai/prompts/identity";

export interface PackCharacter {
  id: string;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  sheet_pack?: unknown;
}

/** A pack that could not be built; tried again after this long, not on every generation. */
const RETRY_AFTER_MS = 10 * 60_000;

/** Which sheets a pack was read from. New uploads get new paths, so a changed sheet changes this. */
export const packSig = (c: Pick<PackCharacter, "face_sheet_path" | "body_sheet_path">) => `${c.body_sheet_path ?? ""}|${c.face_sheet_path ?? ""}`;

type Stored = SheetPack | { v: number; sig: string; failed: true; at: string };

/** The character's saved pack, if it was read from her current sheets. */
export function currentPack(c: PackCharacter): SheetPack | null {
  const p = c.sheet_pack as Stored | null | undefined;
  if (!p || p.v !== PACK_V || p.sig !== packSig(c) || "failed" in p) return null;
  return Array.isArray(p.crops) ? p : null;
}

const busy = new Map<string, Promise<SheetPack | null>>();

/**
 * Her sheet pack: the sheets read once into face and body crops plus her look in words. Built on first use with the
 * person's own vision key and saved on the character. Returns null when she has no sheet, there is no vision key, or
 * reading failed recently; callers then fall back to sending the whole sheet.
 */
/**
 * Set when the database has no sheet_pack column (migration 0010 not run). A pack can't be saved then, so reading the
 * sheet would cost two vision calls on every Inject and be thrown away; the whole sheet is used instead.
 */
let noPackColumn = false;

export async function ensureSheetPack(supabase: SupabaseClient, userId: string, c: PackCharacter): Promise<SheetPack | null> {
  if (!c.face_sheet_path && !c.body_sheet_path) return null;
  if (noPackColumn) return null;
  const have = currentPack(c);
  if (have) return have;
  const stored = c.sheet_pack as Stored | null | undefined;
  const sig = packSig(c);
  if (stored && "failed" in stored && stored.v === PACK_V && stored.sig === sig && Date.now() - Date.parse(stored.at) < RETRY_AFTER_MS) return null;

  const key = `${c.id}:${sig}`;
  let job = busy.get(key);
  if (!job) {
    job = buildPack(supabase, userId, c, sig).finally(() => busy.delete(key));
    busy.set(key, job);
  }
  return job;
}

async function download(supabase: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
  if (error || !data) throw new Error("Could not load the sheet");
  return Buffer.from(await data.arrayBuffer());
}

async function buildPack(supabase: SupabaseClient, userId: string, c: PackCharacter, sig: string): Promise<SheetPack | null> {
  let client;
  let imageMaxEdge: number | undefined;
  try {
    ({ client, imageMaxEdge } = await getUserTextClient(supabase, userId, "vision", "sheet"));
  } catch (e) {
    if (e instanceof ApiKeyRequiredError) return null;
    throw e;
  }

  const created: string[] = [];
  try {
    const [bodyBuf, faceBuf] = await Promise.all([c.body_sheet_path ? download(supabase, c.body_sheet_path) : null, c.face_sheet_path ? download(supabase, c.face_sheet_path) : null]);
    const analyze = async (buf: Buffer | null): Promise<SheetAnalysis | null> => {
      if (!buf) return null;
      const small = await shrinkForVision(buf, imageMaxEdge);
      const meta = await sharp(Buffer.from(small.data, "base64")).metadata();
      const reply = await askJson(client, { prompt: ANALYZE_SHEET_PROMPT, images: [toDataUri(small)] });
      return parseSheetAnalysis(reply, meta.width ?? 1, meta.height ?? 1);
    };
    const [body, face] = await Promise.all([analyze(bodyBuf), analyze(faceBuf)]);
    const merged = mergeAnalyses(body, face);

    const crops: PackCrop[] = [];
    for (const plan of planCrops(merged, { body: !!bodyBuf, face: !!faceBuf })) {
      const src = plan.from === "face" ? faceBuf : bodyBuf;
      if (!src) continue;
      const img = sharp(src).rotate();
      const { width: W = 0, height: H = 0 } = await img.metadata();
      if (!W || !H) continue;
      const r = cropRect(plan.box, plan.pad, plan.minSide, W, H);
      const out = await sharp(src)
        .rotate()
        .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
        .resize(r.outWidth, r.outHeight)
        .jpeg({ quality: 90 })
        .toBuffer();
      const path = finalPath(userId, `characters/${c.id}/pack`);
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, out, { contentType: "image/jpeg" });
      if (error) throw new Error("Could not store the sheet crops");
      created.push(path);
      crops.push({ kind: plan.kind, role: plan.role, path });
    }

    const pack: SheetPack = { ...merged, v: PACK_V, sig, crops, at: new Date().toISOString() };
    // Saved only if the sheets are still the ones that were read.
    let q = supabase.from("characters").update({ sheet_pack: pack }).eq("id", c.id);
    q = c.face_sheet_path ? q.eq("face_sheet_path", c.face_sheet_path) : q.is("face_sheet_path", null);
    q = c.body_sheet_path ? q.eq("body_sheet_path", c.body_sheet_path) : q.is("body_sheet_path", null);
    const { data: saved, error } = await q.select("id");
    if (error || !saved?.length) throw new Error("The sheets changed while they were being read");
    await removePackFiles(supabase, userId, c.sheet_pack);
    return pack;
  } catch {
    if (created.length) await supabase.storage.from(MEDIA_BUCKET).remove(created);
    // Remembered so every generation doesn't pay to read a sheet that can't be read; tried again later.
    await supabase
      .from("characters")
      .update({ sheet_pack: { v: PACK_V, sig, failed: true, at: new Date().toISOString() } })
      .eq("id", c.id);
    await removePackFiles(supabase, userId, c.sheet_pack);
    return null;
  }
}

/** Deletes the crop files of a pack (an old one, or a deleted character's). */
export async function removePackFiles(supabase: SupabaseClient, userId: string, pack: unknown) {
  const paths = packFiles(userId, pack);
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

export function packFiles(userId: string, pack: unknown): string[] {
  const crops = (pack as { crops?: { path?: unknown }[] } | null)?.crops;
  return Array.isArray(crops) ? crops.map((x) => x?.path).filter((p): p is string => typeof p === "string" && isOwnPath(userId, p)) : [];
}

/**
 * Reads one character, including sheet_pack when the database has it. Before migration 0010 runs the column is
 * missing, so the read is retried without it and everything keeps working with the whole sheet.
 */
export async function selectCharacter<T = Record<string, unknown>>(supabase: SupabaseClient, id: string, columns: string): Promise<T | null> {
  const run = (cols: string) => supabase.from("characters").select(cols).eq("id", id).maybeSingle();
  let { data, error } = await run(columns);
  if (error && /sheet_pack/.test(error.message)) {
    noPackColumn = true;
    ({ data, error } = await run(columns.replace(/,?\s*sheet_pack/, "")));
  }
  return error ? null : (data as T | null);
}
