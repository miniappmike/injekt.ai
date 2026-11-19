import sharp from "sharp";
import { ALLOWED_FORMATS } from "@/lib/images";
import { MARK, MARK_BOX } from "@/lib/brand-mark";

/** Longest side of a marketplace preview. Big enough to judge the look, too small to be a usable copy. */
export const PREVIEW_MAX_EDGE = 768;
/** How strong the logos are (owner: 25%). */
export const WATERMARK_OPACITY = 0.25;

/**
 * A transparent layer the size of the image: the ModelSpawn logo, upright, repeated in staggered rows across the whole
 * picture at 25% so it can't be cropped out. Drawn from the logo's path, so no font is needed (the old text watermark
 * drew as empty boxes on the server, which has no fonts). A faint dark outline keeps it visible on pink or bright photos.
 */
export function watermarkSvg(width: number, height: number): string {
  // Small logos (owner: smaller than a fifth of the picture): about a ninth of the short side, never under 32px.
  const lw = Math.max(32, Math.round(Math.min(width, height) / 9));
  const scale = lw / MARK_BOX.w;
  const lh = MARK_BOX.h * scale;
  const tileW = Math.round(lw * 1.9);
  const tileH = Math.round(lh * 3.2);
  // One logo at (x, y), its top-left corner, in pattern space.
  const logo = (x: number, y: number) =>
    `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(5)}) translate(${-MARK_BOX.x} ${-MARK_BOX.y})"><path d="${MARK}" fill="url(#wm-pink)" stroke="rgba(0,0,0,0.35)" stroke-width="${(1.2 / scale).toFixed(1)}"/></g>`;
  // Two rows per tile, the second shifted half a tile, so the logos sit in a brick pattern.
  const gapX = (tileW - lw) / 2;
  const gapY = (tileH / 2 - lh) / 2;
  const cells = [logo(gapX, gapY), logo(gapX + tileW / 2, tileH / 2 + gapY), logo(gapX - tileW / 2, tileH / 2 + gapY)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs>
<radialGradient id="wm-pink" gradientUnits="userSpaceOnUse" cx="1000" cy="965" r="820"><stop offset="0" stop-color="#ff8fc0"/><stop offset="0.45" stop-color="#ff5fa2"/><stop offset="0.8" stop-color="#fb3a82"/><stop offset="1" stop-color="#f92776"/></radialGradient>
<pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse">${cells.join("")}</pattern>
</defs>
<rect width="${width}" height="${height}" fill="url(#wm)" opacity="${WATERMARK_OPACITY}"/>
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
