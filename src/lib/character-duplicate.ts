import { randomUUID } from "node:crypto";
import { isOwnPath, isPinnedPath, pinnedFolder } from "@/lib/uploads";

/** What Duplicate reads from the character being copied. */
export interface DuplicateSource {
  name: string;
  lore: string | null;
  always_keep: string | null;
  height: string | null;
  weight: string | null;
  profile: unknown;
  profile_photo_path: string | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
  sheet_pack?: unknown;
  provenance_attested_at: string;
}

const NAME_MAX = 80;

/** "Ava" becomes "Ava (copy)", kept inside the name limit. */
export function copyName(name: string): string {
  const tail = " (copy)";
  return name.slice(0, NAME_MAX - tail.length).trimEnd() + tail;
}

/**
 * The copy's row and the files to copy for it. Every image gets its own file under the new character, so deleting or
 * changing one of the two never touches the other. Her profile text and her read sheet pack (the fixed identity block
 * prompts use) are carried over word for word; only the file paths inside the pack change.
 */
export function planDuplicate(userId: string, newId: string, src: DuplicateSource) {
  const copies: { from: string; to: string }[] = [];
  const moved = new Map<string, string>();
  const move = (from: string | null | undefined, folder?: string): string | null => {
    if (!from || !isOwnPath(userId, from)) return null;
    const had = moved.get(from);
    if (had) return had;
    const ext = /\.([A-Za-z0-9]{2,5})$/.exec(from)?.[1]?.toLowerCase() ?? "jpg";
    const dir = folder ?? (isPinnedPath(from) ? pinnedFolder(newId) : `characters/${newId}`);
    const to = `${userId}/${dir}/${randomUUID()}.${ext}`;
    moved.set(from, to);
    copies.push({ from, to });
    return to;
  };

  const images = {
    profile_photo_path: move(src.profile_photo_path),
    face_sheet_path: move(src.face_sheet_path),
    body_sheet_path: move(src.body_sheet_path),
    reference_paths: src.reference_paths.map((p) => move(p)).filter((p): p is string => !!p),
  };

  // The pack is tied to the sheets it was read from by their paths (same formula as packSig in sheet-pack.ts). A pack
  // that failed to build, or one read from sheets she no longer has, is left out and read again on first use.
  const sigOf = (c: { face_sheet_path: string | null; body_sheet_path: string | null }) => `${c.body_sheet_path ?? ""}|${c.face_sheet_path ?? ""}`;
  const pack = src.sheet_pack as { sig?: unknown; failed?: unknown; crops?: { path?: unknown }[] } | null | undefined;
  let sheet_pack: unknown = null;
  if (pack && !pack.failed && Array.isArray(pack.crops) && pack.sig === sigOf(src)) {
    const crops = pack.crops.map((c) => ({ ...c, path: typeof c?.path === "string" ? move(c.path, `characters/${newId}/pack`) : null }));
    if (crops.every((c) => c.path)) sheet_pack = { ...pack, sig: sigOf(images), crops };
  }

  return {
    copies,
    row: {
      id: newId,
      user_id: userId,
      name: copyName(src.name),
      lore: src.lore,
      always_keep: src.always_keep,
      height: src.height,
      weight: src.weight,
      profile: src.profile ?? {},
      ...images,
      provenance_attested_at: src.provenance_attested_at,
    },
    sheet_pack,
  };
}
