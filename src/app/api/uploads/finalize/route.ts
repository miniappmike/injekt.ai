import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { RateLimitError } from "@/lib/errors";
import { MEDIA_BUCKET, stripAndNormalize, UPLOAD_SLOTS } from "@/lib/images";
import { finalPath, isOwnRawPath, PENDING_FOLDER } from "@/lib/uploads";

export const maxDuration = 60;

const body = z.object({
  rawPath: z.string().min(1),
  slot: z.enum(UPLOAD_SLOTS),
  characterId: z.string().uuid().optional(),
});

const COLUMN = {
  profile_photo: "profile_photo_path",
  face_sheet: "face_sheet_path",
  body_sheet: "body_sheet_path",
} as const;

// Browser uploads the raw file straight to storage with a signed URL. This route then strips
// metadata (EXIF, GPS), stores the clean JPEG, deletes the raw file and attaches it to the character.
export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { rawPath, slot, characterId } = parsed.data;
  if (!isOwnRawPath(user.id, rawPath)) return NextResponse.json({ error: "Bad path" }, { status: 400 });

  try {
    await enforceRateLimit(user.id, "upload", 30, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: "Too many uploads, slow down" }, { status: 429 });
    throw e;
  }

  const storage = supabase.storage.from(MEDIA_BUCKET);
  try {
    let character: { reference_paths: string[]; profile_photo_path: string | null; face_sheet_path: string | null; body_sheet_path: string | null } | null = null;
    // Without a characterId this is a draft upload from the new-character page: stored in a holding
    // folder and attached when the character is saved.
    if (slot !== "target" && characterId) {
      const { data } = await supabase
        .from("characters")
        .select("reference_paths, profile_photo_path, face_sheet_path, body_sheet_path")
        .eq("id", characterId)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: "Character not found" }, { status: 404 });
      if (slot === "reference" && data.reference_paths.length >= 3) {
        return NextResponse.json({ error: "A character can have up to 3 reference images" }, { status: 400 });
      }
      character = data;
    }

    const { data: blob, error: dlError } = await storage.download(rawPath);
    if (dlError || !blob) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    let clean: Buffer;
    try {
      clean = await stripAndNormalize(Buffer.from(await blob.arrayBuffer()));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid image" }, { status: 400 });
    }

    const path = finalPath(user.id, slot === "target" ? "targets" : characterId ? `characters/${characterId}` : PENDING_FOLDER);
    const { error: upError } = await storage.upload(path, clean, { contentType: "image/jpeg" });
    if (upError) return NextResponse.json({ error: "Could not store image" }, { status: 500 });

    if (character && characterId) {
      let previous: string | null = null;
      let update: Record<string, unknown>;
      if (slot === "reference") {
        update = { reference_paths: [...character.reference_paths, path] };
      } else {
        const column = COLUMN[slot as keyof typeof COLUMN];
        previous = character[column];
        update = { [column]: path };
      }
      const { error } = await supabase
        .from("characters")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", characterId);
      if (error) {
        await storage.remove([path]);
        return NextResponse.json({ error: "Could not save image" }, { status: 500 });
      }
      if (previous) await storage.remove([previous]);
    }
    return NextResponse.json({ path });
  } finally {
    await storage.remove([rawPath]);
  }
}
