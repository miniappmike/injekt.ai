import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/lib/images";
import { referencesFor, type CharacterImagePaths } from "@/lib/character-images";

/**
 * Write only: prompts for another generator. Her references there are her sheets (or her first photo), not the app's
 * crops, which the person doesn't have; each prompt lists the images to attach in @image order.
 */

/** One image to attach, in @image order. `path` is only used on the server, to make the links, and never sent. */
export interface AttachItem {
  tag: string;
  label: string;
  source: "ref" | "photo" | "extra" | "target";
  /** Extras: which one (0-based). */
  index?: number;
  url?: string;
  downloadUrl?: string;
  path?: string;
}

export interface StandaloneRef {
  /** How the prompt describes it ("her face reference sheet"). */
  role: string;
  /** Matches identity.ts kinds, so her body comes from the body sheet. */
  kind: "faces" | "body" | "photo";
  /** How the attach list names it ("Holly's face sheet"). */
  label: string;
  path: string;
}

/** Her references for a prompt pasted elsewhere: her face and body sheets, or her first reference photo. */
export function standaloneRefs(c: CharacterImagePaths & { name: string }): StandaloneRef[] {
  return referencesFor("carousel", c).map((r, i) =>
    r.path === c.face_sheet_path
      ? { role: "her face reference sheet", kind: "faces", label: `${c.name}'s face sheet`, path: r.path }
      : r.path === c.body_sheet_path
        ? { role: "her body reference sheet", kind: "body", label: `${c.name}'s body sheet`, path: r.path }
        : { role: "a reference photo of her", kind: "photo", label: `${c.name}'s reference photo ${i + 1}`, path: r.path },
  );
}

/** Numbers the images @image1, @image2... in the order given. */
export const tagItems = (items: Omit<AttachItem, "tag">[]): AttachItem[] => items.map((x, i) => ({ ...x, tag: `@image${i + 1}` }));

/** The attach list as text, for copying with the prompt. */
export const attachText = (items: AttachItem[]) => items.map((x) => `${x.tag}: ${x.label}`);

/** Adds view and save links to every item with a stored file, then drops the paths so they never reach the page. */
export async function linkAttachItems(supabase: SupabaseClient, items: AttachItem[]) {
  const paths = [...new Set(items.map((x) => x.path).filter((p): p is string => !!p))];
  const storage = supabase.storage.from(MEDIA_BUCKET);
  const links = new Map<string, { url?: string; downloadUrl?: string }>();
  await Promise.all(
    paths.map(async (p) => {
      const [view, save] = await Promise.all([storage.createSignedUrl(p, 3600), storage.createSignedUrl(p, 3600, { download: true })]);
      links.set(p, { url: view.data?.signedUrl, downloadUrl: save.data?.signedUrl });
    }),
  );
  for (const x of items) {
    if (!x.path) continue;
    Object.assign(x, links.get(x.path) ?? {});
    delete x.path;
  }
}
