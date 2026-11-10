import sharp from "sharp";
import { ALLOWED_FORMATS } from "@/lib/images";

/** Longest side of a marketplace preview. Big enough to judge the look, too small to be a usable copy. */
export const PREVIEW_MAX_EDGE = 768;
export const WATERMARK_TEXT = "MODEL SPAWN · PREVIEW";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * A transparent layer the size of the image: the text repeated on a diagonal across the whole picture (so it can't be
 * cropped out), plus a small badge in the bottom-right corner. Each text is drawn twice, dark then light, so it stays
 * readable on both bright and dark pictures.
 */
export function watermarkSvg(width: number, height: number): string {
  const font = Math.max(14, Math.round(Math.min(width, height) / 22));
  const tileW = Math.round(font * 16);
  const tileH = Math.round(font * 5);
  const text = (fill: string, dx: number, dy: number) =>
    `<text x="${tileW / 2 + dx}" y="${tileH / 2 + dy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${font}" font-weight="700" letter-spacing="2" fill="${fill}">${esc(WATERMARK_TEXT)}</text>`;
  const badgeFont = Math.max(11, Math.round(font * 0.7));
  const badgeW = Math.round(badgeFont * 12);
  const badgeH = Math.round(badgeFont * 2);
  const bx = width - badgeW - 8;
  const by = height - badgeH - 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">${text("rgba(0,0,0,0.28)", 1.5, 1.5)}${text("rgba(255,255,255,0.42)", 0, 0)}</pattern></defs>
<rect width="${width}" height="${height}" fill="url(#wm)"/>
<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="rgba(0,0,0,0.6)"/>
<text x="${bx + badgeW / 2}" y="${by + badgeH / 2 + badgeFont * 0.35}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${badgeFont}" font-weight="700" fill="#fff">PREVIEW ONLY</text>
</svg>`;
}

/**
 * Turns any uploaded or existing picture into a safe public preview: orientation applied and ALL metadata dropped,
 * shrunk to fit inside 768px (never enlarged), watermarked across the whole image, and saved as a modest-quality JPEG.
 */
export async function makePreview(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const meta = await sharp(input).metadata();
  if (!meta.format || !(ALLOWED_FORMATS as readonly string[]).includes(meta.format)) {
    throw new Error("Unsupported image type. Use JPEG, PNG or WebP.");
  }
  const base = await sharp(input)
    .rotate()
    .resize({ width: PREVIEW_MAX_EDGE, height: PREVIEW_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const data = await sharp(base.data)
    .composite([{ input: Buffer.from(watermarkSvg(width, height)), top: 0, left: 0 }])
    .jpeg({ quality: 72 })
    .toBuffer();
  return { data, width, height };
}
