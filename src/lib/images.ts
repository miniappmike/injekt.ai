import sharp from "sharp";

export const MEDIA_BUCKET = "character-media";
export const ALLOWED_FORMATS = ["jpeg", "png", "webp"] as const;

/**
 * Re-encodes an upload as JPEG. This applies the EXIF orientation first and then drops ALL
 * metadata (GPS, device, timestamps), because sharp only keeps metadata when asked to.
 */
export async function stripAndNormalize(input: Buffer, maxEdge = 4096): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  if (!meta.format || !(ALLOWED_FORMATS as readonly string[]).includes(meta.format)) {
    throw new Error("Unsupported image type. Use JPEG, PNG or WebP.");
  }
  return sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Smaller copy for sending to vision models (providers cap image size). */
export async function shrinkForVision(input: Buffer, maxEdge = 1568): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const out = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mediaType: "image/jpeg", data: out.toString("base64") };
}

export const toDataUri = (img: { mediaType: string; data: string }) => `data:${img.mediaType};base64,${img.data}`;

export function parseDataUri(uri: string): { mediaType: string; data: string } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(uri);
  if (!m) throw new Error("Expected a base64 data URI");
  return { mediaType: m[1], data: m[2] };
}

export const UPLOAD_SLOTS = ["profile_photo", "face_sheet", "body_sheet", "reference", "target"] as const;
export type UploadSlot = (typeof UPLOAD_SLOTS)[number];
