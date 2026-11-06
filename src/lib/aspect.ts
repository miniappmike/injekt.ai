import { IMAGE_ASPECT_RATIOS, type ImageAspectRatio } from "@/lib/ai/providers/types";

/** The offered ratio closest to an image's shape, compared on a log scale (artifact arFor). */
export function closestAspectRatio(width: number, height: number): ImageAspectRatio | undefined {
  if (!(width > 0 && height > 0)) return undefined;
  const r = width / height;
  let best: ImageAspectRatio | undefined;
  let d = Infinity;
  for (const a of IMAGE_ASPECT_RATIOS) {
    if (a === "auto") continue;
    const [w, h] = a.split(":").map(Number);
    const e = Math.abs(Math.log(r / (w / h)));
    if (e < d) {
      d = e;
      best = a;
    }
  }
  return best;
}
