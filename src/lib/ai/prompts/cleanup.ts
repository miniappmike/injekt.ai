/**
 * Overlay cleanup (artifact A3): find things laid on top of a photo (app UI, watermarks, stickers, captions), then crop
 * them off when they sit clear of the person, or paint over them. Pure functions; the server does the image I/O.
 */
import type { Box } from "./identity";

/** Artifact detectOverlays prompt, word for word. */
export const DETECT_OVERLAYS_PROMPT = `Look at the attached photo. Find things laid ON TOP of the photo that are not part of the real scene: app interface elements (floating or round buttons, icons, menus, status bars, navigation bars, like, comment and share bars, progress bars, play buttons, page dots), watermarks, usernames and handles, caption or text overlays, stickers, emoji, timestamps, and borders or letterbox bars. NOT overlays: anything physically in the scene, such as signs, posters, a phone held in a mirror selfie and its screen, logos on clothing, or text on objects.
Give positions as fractions of the image width and height (0 is the left or top edge, 1 the right or bottom edge) as [x0, y0, x1, y1], drawn generously so each box fully covers its overlay.
Reply with only JSON: {"overlays": [{"what": "short name", "box": [x0,y0,x1,y1]}], "person": [x0,y0,x1,y1] or null}. "person" is one box around the whole main person, head to toe as far as visible, including anything they hold. Use an empty list when there are no overlays.`;

export interface Overlay {
  what: string;
  box: Box;
}

/**
 * Reads the detection reply (boxes must be fractions, a little slack allowed; at most 12 overlays). The artifact ran these
 * through the sheet layout check, which drops anything under 6% of the picture: that loses thin status bars and caption
 * strips, so overlays only need to be 1% on each side.
 */
export function parseOverlays(raw: unknown): { ovs: Overlay[]; person: Box | null } {
  const r = (raw && typeof raw === "object" ? raw : {}) as { overlays?: unknown; person?: unknown };
  const bx = (b: unknown): Box | null => {
    if (!Array.isArray(b) || b.length !== 4) return null;
    const v = b.map(Number);
    if (v.some((x) => !Number.isFinite(x) || x < -0.05 || x > 1.05)) return null;
    let [x0, y0, x1, y1] = v.map((n) => Math.max(0, Math.min(1, n)));
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    return x1 - x0 > 0.01 && y1 - y0 > 0.01 ? ([x0, y0, x1, y1] as Box) : null;
  };
  const ovs = (Array.isArray(r.overlays) ? r.overlays : [])
    .map((o) => (o && typeof o === "object" ? { what: String((o as { what?: unknown }).what || "overlay").slice(0, 40), box: bx((o as { box?: unknown }).box) } : null))
    .filter((o): o is Overlay => !!o && !!o.box)
    .slice(0, 12);
  return { ovs, person: bx(r.person) };
}

export interface CleanPlan {
  /** The part of the image to keep, as fractions. */
  crop: Box;
  /** Overlays to paint over, padded, as fractions of the original image. */
  patches: Overlay[];
  /** What was removed (cropped off or painted over), for the "Removed: ..." note. */
  removed: string[];
}

const pad = (b: Box): Box => {
  const px = (b[2] - b[0]) * 0.15 + 0.006;
  const py = (b[3] - b[1]) * 0.15 + 0.006;
  return [Math.max(0, b[0] - px), Math.max(0, b[1] - py), Math.min(1, b[2] + px), Math.min(1, b[3] + py)];
};

/** Artifact cleanImage's decisions: crop an overlay off when it's clear of the person and cheap to lose, else patch it. */
export function planClean(ovs: Overlay[], person: Box | null): CleanPlan {
  const P = person || [0.3, 0.15, 0.7, 1];
  const m = 0.01;
  const C: Box = [0, 0, 1, 1];
  const left: Overlay[] = [];
  const cut: string[] = [];
  const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
  for (const o of ovs.slice().sort((a, b) => area(b.box) - area(a.box))) {
    const b = pad(o.box);
    if (b[2] <= C[0] || b[0] >= C[2] || b[3] <= C[1] || b[1] >= C[3]) {
      cut.push(o.what);
      continue;
    }
    const cw = C[2] - C[0];
    const ch = C[3] - C[1];
    const opts: [number, number, number][] = [];
    if (b[0] >= P[2] + m) opts.push([2, b[0], (C[2] - b[0]) * ch]);
    if (b[2] <= P[0] - m) opts.push([0, b[2], (b[2] - C[0]) * ch]);
    if (b[3] <= P[1] - m) opts.push([1, b[3], (b[3] - C[1]) * cw]);
    if (b[1] >= P[3] + m) opts.push([3, b[1], (C[3] - b[1]) * cw]);
    opts.sort((x, y) => x[2] - y[2]);
    const o1 = opts.find((x) => x[2] <= 0.18 && cw * ch - x[2] >= 0.78);
    if (o1) {
      C[o1[0]] = o1[1];
      cut.push(o.what);
    } else left.push(o);
  }
  return { crop: C, patches: left.map((o) => ({ what: o.what, box: pad(o.box) })), removed: cut };
}

/**
 * Paints over a rectangle by blending the pixels around its edges, weighted toward the nearest edge, with slight noise
 * (artifact fillPatch). `data` is raw RGB, `w` x `h` pixels; coordinates are pixels.
 */
export function fillPatch(data: Uint8Array | Buffer, W: number, H: number, x0f: number, y0f: number, x1f: number, y1f: number, random: () => number = Math.random): boolean {
  const x0 = Math.max(1, Math.floor(x0f));
  const y0 = Math.max(1, Math.floor(y0f));
  const x1 = Math.min(W - 2, Math.ceil(x1f));
  const y1 = Math.min(H - 2, Math.ceil(y1f));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 2 || h < 2) return false;
  // Edge pixels are read before anything is painted, so the fill doesn't feed on itself.
  const at = (x: number, y: number, c: number) => data[(y * W + x) * 3 + c];
  const left: number[] = [];
  const right: number[] = [];
  const top: number[] = [];
  const bottom: number[] = [];
  for (let j = 1; j <= h; j++) for (let c = 0; c < 3; c++) {
    left.push(at(x0 - 1, y0 - 1 + j, c));
    right.push(at(x1 + 1, y0 - 1 + j, c));
  }
  for (let i = 1; i <= w; i++) for (let c = 0; c < 3; c++) {
    top.push(at(x0 - 1 + i, y0 - 1, c));
    bottom.push(at(x0 - 1 + i, y1 + 1, c));
  }
  for (let j = 1; j <= h; j++)
    for (let i = 1; i <= w; i++) {
      const u = i / (w + 1);
      const v = j / (h + 1);
      const wu = 1 / Math.max(0.02, Math.min(u, 1 - u));
      const wv = 1 / Math.max(0.02, Math.min(v, 1 - v));
      const n = (random() - 0.5) * 6;
      for (let c = 0; c < 3; c++) {
        const hz = left[(j - 1) * 3 + c] * (1 - u) + right[(j - 1) * 3 + c] * u;
        const vt = top[(i - 1) * 3 + c] * (1 - v) + bottom[(i - 1) * 3 + c] * v;
        data[((y0 - 1 + j) * W + (x0 - 1 + i)) * 3 + c] = Math.max(0, Math.min(255, Math.round((hz * wu + vt * wv) / (wu + wv) + n)));
      }
    }
  return true;
}
