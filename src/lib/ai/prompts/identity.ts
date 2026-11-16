/**
 * The identity engine from the artifact (A9, A12, A16): reading a reference sheet once, and the wrappers that put her
 * face and body into every image prompt. Ported word for word; only the plumbing differs (crops are stored files, not
 * data URLs). Pure functions, so the server and the tests share them.
 */
import { hasQualityLine, fence, joinTags, OVERLAY_RULE, REALISM_FIX, skinNote, tagList, TEXT_SHORT } from "./rules";
import { identityBlock, isSheetKind, paragraphs, personOnly, priority, realKeep, refRoles, sentences, tattooLine } from "./lean";

/** Bump to make every saved sheet pack rebuild. */
export const PACK_V = 3;

export type Box = [number, number, number, number];
export type CropKind = "front" | "faces" | "side" | "body";

export interface Anchors {
  hair?: string;
  face?: string;
  skin?: string;
  upper?: string;
  mid?: string;
  legs?: string;
  /** Measured proportions, written out. */
  prop?: string;
  avoid?: string[];
  /** The placeholder outfit she wears in the sheet. */
  sheetOutfit?: string;
}

export interface FaceGrid {
  box: Box;
  rows: number;
  cols: number;
  front: [number, number];
}

export interface SheetAnalysis {
  body: Box | null;
  side: Box | null;
  faces: FaceGrid | null;
  anchors: Anchors;
}

export interface PackCrop {
  kind: CropKind;
  /** What the image is, as the image model is told ("a close-up of her face from the front"). */
  role: string;
  /** Where the crop is stored. */
  path: string;
}

export interface SheetPack extends SheetAnalysis {
  v: number;
  /** Which sheets the pack was read from; a different value means the sheets changed. */
  sig: string;
  facesFrom: "face" | "body";
  crops: PackCrop[];
  at: string;
}

/** Clamps a box to the image and drops it when a side is under 6% of the image. */
export function okBox(v: number[]): Box | null {
  let [x0, y0, x1, y1] = v.map((n) => Math.max(0, Math.min(1, n)));
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  return x1 - x0 > 0.06 && y1 - y0 > 0.06 ? [x0, y0, x1, y1] : null;
}

/** Artifact A16 analyzeSheet prompt, word for word. */
export const ANALYZE_SHEET_PROMPT = `The attached image is a character reference sheet for one adult woman. It may show full-body views, a grid of face portraits, or both. Do two things.

1. LAYOUT. Give positions as fractions of the image width and height (0 is the left or top edge, 1 is the right or bottom edge), as [x0, y0, x1, y1].
- "body": one box around all the full-body views together, head to feet, or null if there are none.
- "side": one box around the single full-body side-profile view (head to feet), or null if there is none.
- "faces": the grid of face or head-and-shoulders portraits: "box" around the whole grid, its "rows" and "cols", and "front" as [row, col] counted from 0 for the panel that shows her face most directly from the front with a neutral or soft expression. null if there are no face portraits.
2. HER LOOK IN WORDS, from what the sheet shows. One definitive value per attribute, no ranges, no hedging, plain, concrete wording for the body, always an adult woman. If her figure is extreme or exaggerated, say so plainly at full strength ("extremely large bust", "very wide hips", "tiny waist", "very large round glutes"); never soften it toward an average body:
- "hair": one named shade plus length, cut, texture and parting
- "face": face shape, eye shape and one named eye colour, brows, nose, lips, any distinctive feature
- "skin": tone with undertone, freckles, moles and marks with where they are
- "upper": shoulders, bust and arms
- "mid": waist, hips and glutes
- "legs": thighs, legs and the overall height impression
3. HER PROPORTIONS, measured on the full-body views (estimate carefully from the pixels, not from typical bodies):
- "waist_to_hip": front view, narrowest waist width divided by widest hip width, a number like 0.62
- "hip_to_shoulder": front view, widest hip width divided by shoulder width, a number like 1.35
- "profile": one plain sentence describing her side silhouette relative to her own body, for example "in profile her glutes project well past the line of her upper back and her lower back curves in sharply"
- "thighs": one plain sentence comparing thigh width to her waist or knees
- "avoid": 3 to 6 short phrases starting with "not" for the most likely wrong versions an image model drifts to (for example "not bright cherry red hair", "not a slim, narrow-hipped figure")
4. "sheet_outfit": the clothing she wears in the full-body views, in at most 15 words with colours (for example "a white ribbed bandeau top and white fitted shorts"), or "" if she wears none or there are no full-body views.

Reply with only JSON: {"body": [x0,y0,x1,y1] or null, "faces": {"box": [x0,y0,x1,y1], "rows": 1, "cols": 1, "front": [0,0]} or null, "hair": "", "face": "", "skin": "", "upper": "", "mid": "", "legs": "", "side": [x0,y0,x1,y1] or null, "waist_to_hip": 0.0, "hip_to_shoulder": 0.0, "profile": "", "thighs": "", "avoid": [""], "sheet_outfit": ""}`;

/** Reads the analyzeSheet reply. W and H are the pixel size of the image the model saw (for replies in pixels). */
export function parseSheetAnalysis(raw: unknown, W: number, H: number): SheetAnalysis {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The sheet could not be read.");
  const r = raw as Record<string, unknown>;
  const norm = (b: unknown): Box | null => {
    if (!Array.isArray(b) || b.length !== 4) return null;
    let v = b.map(Number);
    if (v.some((x) => !Number.isFinite(x))) return null;
    if (Math.max(...v) > 1.5) v = [v[0] / W, v[1] / H, v[2] / W, v[3] / H];
    return okBox(v);
  };
  let faces: FaceGrid | null = null;
  const f = r.faces as Record<string, unknown> | null | undefined;
  if (f && typeof f === "object") {
    const box = norm(f.box);
    const rows = Math.round(Number(f.rows));
    const cols = Math.round(Number(f.cols));
    if (box && rows >= 1 && rows <= 6 && cols >= 1 && cols <= 6) {
      let fr = Array.isArray(f.front) ? f.front.map((n) => Math.round(Number(n))) : [0, 0];
      if (!(fr[0] >= 0 && fr[0] < rows && fr[1] >= 0 && fr[1] < cols)) fr = [0, 0];
      faces = { box, rows, cols, front: [fr[0], fr[1]] };
    }
  }
  const str = (k: string) => (typeof r[k] === "string" && !/^not visible$/i.test((r[k] as string).trim()) ? (r[k] as string).trim().slice(0, 400) : "");
  const anchors: Anchors = {
    hair: str("hair"),
    face: str("face"),
    skin: str("skin"),
    upper: str("upper"),
    mid: str("mid"),
    legs: str("legs"),
    avoid: (Array.isArray(r.avoid) ? r.avoid : [])
      .filter((x): x is string => typeof x === "string" && !!x.trim())
      .map((x) => x.trim().slice(0, 90))
      .slice(0, 6),
    sheetOutfit: str("sheet_outfit").slice(0, 140),
  };
  const wh = Number(r.waist_to_hip);
  const hs = Number(r.hip_to_shoulder);
  const pr: string[] = [];
  if (Number.isFinite(wh) && wh >= 0.3 && wh <= 1.1) pr.push(`waist about ${Math.round(wh * 100)}% of her hip width`);
  if (Number.isFinite(hs) && hs >= 0.7 && hs <= 2.6)
    pr.push(
      hs >= 1.05
        ? `hips about ${Math.round(hs * 100) / 100}× her shoulder width, clearly wider than her shoulders`
        : hs <= 0.95
          ? `hips about ${Math.round(hs * 100) / 100}× her shoulder width, narrower than her shoulders`
          : "hips about as wide as her shoulders",
    );
  for (const k of ["profile", "thighs"])
    if (typeof r[k] === "string" && (r[k] as string).trim()) pr.push((r[k] as string).trim().replace(/\.$/, "").slice(0, 200));
  anchors.prop = pr.join("; ");
  return { body: norm(r.body), side: norm(r.side), faces, anchors };
}

/**
 * Combines what was read from a body sheet and a face sheet: face, hair, skin and the face grid from the face sheet;
 * build, proportions and the body crops from the body sheet. (The artifact dropped the sheet outfit here; it is kept,
 * so the outfit lock still knows which placeholder outfit to keep out.)
 */
export function mergeAnalyses(body: SheetAnalysis | null, face: SheetAnalysis | null): Omit<SheetPack, "v" | "sig" | "crops" | "at"> {
  if (body && face) {
    const A = body.anchors;
    const F = face.anchors;
    return {
      body: body.body,
      side: body.side,
      faces: face.faces || body.faces,
      facesFrom: face.faces ? "face" : "body",
      anchors: {
        hair: F.hair || A.hair,
        face: F.face || A.face,
        skin: F.skin || A.skin,
        upper: A.upper,
        mid: A.mid,
        legs: A.legs,
        prop: A.prop,
        avoid: [...new Set([...(F.avoid || []), ...(A.avoid || [])])].slice(0, 8),
        sheetOutfit: A.sheetOutfit,
      },
    };
  }
  if (face) return { ...face, body: null, side: null, facesFrom: "face" };
  if (body) return { ...body, facesFrom: "body" };
  throw new Error("No sheet to read.");
}

/** A crop to cut: the box in fractions with padding, and the output scale rules from the artifact's cropBox. */
export interface CropPlan {
  kind: CropKind;
  role: string;
  /** Which sheet it comes from. */
  from: "face" | "body";
  box: Box;
  pad: number;
  minSide: number;
}

/** Artifact makeCrops: the face close-up, the face grid, the side view and the full body, with their roles. */
export function planCrops(p: Pick<SheetPack, "faces" | "side" | "body" | "facesFrom">, has: { body: boolean; face: boolean }): CropPlan[] {
  const out: CropPlan[] = [];
  const fromFace = p.facesFrom === "face" ? " (from her face sheet)" : "";
  const fromBody = has.face ? " (from her body sheet)" : "";
  const faceSrc = p.facesFrom === "face" && has.face ? "face" : "body";
  if (p.faces && (faceSrc === "face" ? has.face : has.body)) {
    const { box, rows, cols, front } = p.faces;
    const cw = (box[2] - box[0]) / cols;
    const ch = (box[3] - box[1]) / rows;
    const fb: Box = [box[0] + cw * front[1], box[1] + ch * front[0], box[0] + cw * (front[1] + 1), box[1] + ch * (front[0] + 1)];
    out.push({ kind: "front", role: "a close-up of her face from the front" + fromFace, from: faceSrc, box: fb, pad: 0.04, minSide: 640 });
    if (rows * cols > 1) out.push({ kind: "faces", role: "her face from many angles" + fromFace, from: faceSrc, box, pad: 0.01, minSide: 900 });
  }
  if (p.side && has.body)
    out.push({ kind: "side", role: "her body shape from the side, showing her real silhouette in profile" + fromBody, from: "body", box: p.side, pad: 0.03, minSide: 900 });
  if (p.body && has.body) out.push({ kind: "body", role: "her full body from the front, side and back" + fromBody, from: "body", box: p.body, pad: 0.02, minSide: 1000 });
  return out;
}

/** The pixel rectangle and output size for a crop, as the artifact's cropBox works them out (largest side 1400). */
export function cropRect(box: Box, pad: number, minSide: number, W: number, H: number) {
  let [x0, y0, x1, y1] = box;
  const px = (x1 - x0) * pad;
  const py = (y1 - y0) * pad;
  x0 = Math.max(0, x0 - px);
  y0 = Math.max(0, y0 - py);
  x1 = Math.min(1, x1 + px);
  y1 = Math.min(1, y1 + py);
  const left = Math.min(W - 1, Math.max(0, Math.round(x0 * W)));
  const top = Math.min(H - 1, Math.max(0, Math.round(y0 * H)));
  const width = Math.max(1, Math.min(W - left, Math.round(Math.max(8, (x1 - x0) * W))));
  const height = Math.max(1, Math.min(H - top, Math.round(Math.max(8, (y1 - y0) * H))));
  const k = Math.min(Math.max(1, minSide / Math.min(width, height)), 1400 / Math.max(width, height));
  return { left, top, width, height, outWidth: Math.max(8, Math.round(width * k)), outHeight: Math.max(8, Math.round(height * k)) };
}

/** Models that take fewer images keep the most useful references. */
export function fitCrops<T extends { kind: CropKind }>(crops: T[], max: number): T[] {
  if (!max || crops.length <= max) return crops;
  const order: CropKind[] = ["front", "body", "side", "faces"];
  return crops
    .slice()
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, max);
}

const bodyRefTags = (kinds: string[], tags: string[]) => joinTags(kinds.map((k, i) => (k === "body" || k === "side" ? tags[i] : null)).filter((x): x is string => !!x));

/** The sheet's words, given to the prompt writer as the source of truth. */
export function sheetLines(pack: Pick<SheetPack, "v" | "anchors"> | null | undefined): string {
  const a = pack && pack.v === PACK_V && pack.anchors;
  if (!a) return "";
  const body = [a.upper, a.mid, a.prop && `proportions: ${a.prop}`, a.legs].filter(Boolean).join("; ");
  const L = [a.hair && `Hair: ${a.hair}`, a.face && `Face: ${a.face}`, a.skin && `Skin: ${a.skin}`, body && `Body: ${body}`, a.avoid && a.avoid.length && `Never: ${a.avoid.join("; ")}`].filter(Boolean);
  return L.length
    ? `\nFROM HER REFERENCE SHEET (source of truth: wherever the profile above differs, including its identity line, follow these lines, but still describe only what is visible in the target):\n${L.join("\n")}`
    : "";
}

/** Removes body words in a scene prompt that contradict a curvy sheet (or a slim one). */
export function bodyScrub(t: string, a: Anchors | null | undefined): string {
  const m = String((a && [a.mid, a.legs].join(" ")) || "").toLowerCase();
  if (/curv|hourglass|wide|full|round|prominent|large|big|huge|extreme|exaggerat|voluptuous|thick/.test(m) && !/(?:slim|slender|narrow|lean)[- ](?:hips|hipped|figure|build|frame|glutes)/.test(m))
    return t
      .replace(/\b(?:slim[- ]athletic|slim|slender|lean|athletic|willowy|narrow[- ]hipped)\s+(?=(?:frame|build|figure|body|physique)\b)/gi, "curvy hourglass ")
      .replace(/\bnarrow[- ]hipped\b/gi, "wide-hipped");
  if (/(?:slim|slender|lean)[- ](?:hips|hipped|figure|build|frame|glutes)|narrow hips/.test(m) && !/curv|hourglass/.test(m))
    return t.replace(/\b(?:curvy|voluptuous|hourglass)\s+(?=(?:frame|build|figure|body|physique)\b)/gi, "slim ");
  return t;
}

/** Keeps only the anchor words for what is visible in this image (the IN FRAME line). Empty frame keeps everything. */
export function pickAnchors(a: Anchors | null | undefined, frame?: string) {
  a = a || {};
  const f = String(frame || "").toLowerCase();
  const all = !f.trim();
  const has = (re: RegExp) => all || re.test(f);
  const faceV = has(/face/);
  const hairV = has(/hair|face|head/);
  const upV = has(/shoulder|bust|chest|arm|upper|torso/);
  const midV = has(/waist|hip|glute|torso/);
  const legV = has(/thigh|leg|feet|foot|knee|full/);
  const avoid = (a.avoid || []).filter((x) => {
    const t = x.toLowerCase();
    if (/hair/.test(t)) return hairV;
    if (/eye|nose|face|jaw|lip|brow|cheek|chin/.test(t)) return faceV;
    if (/slim|thin|hip|glute|waist|curv|figure|body|bust|chest|leg|thigh|athletic|skinny|narrow|build/.test(t)) return upV || midV || legV;
    return true;
  });
  return {
    hair: hairV ? a.hair || "" : "",
    face: faceV ? a.face || "" : "",
    skin: skinNote(a.skin || ""),
    upper: upV ? a.upper || "" : "",
    mid: midV ? [a.mid, a.prop].filter(Boolean).join("; ") : "",
    legs: legV ? a.legs || "" : "",
    avoid,
  };
}

/** Cleans an LLM scene prompt for n reference images: drops its own identity opener and points every tag at them. */
/**
 * The written prompt's own opener ("Use @image1 as the strict identity reference.", or with both sheets "Use @image1
 * (her face sheet) and @image2 (her body sheet) as ..."), which the framing replaces with its own.
 */
const OPENER =
  /^\s*(?:Use|Using)\s+(?:@[\w-]+|the\s+(?:uploaded\s+)?(?:character\s+)?(?:reference\s+)?(?:sheet|image|photo)s?)(?:\s*\([^)]*\))?(?:\s*(?:,|and)\s*@[\w-]+(?:\s*\([^)]*\))?)*\s+as\s+the\s+(?:strict\s+)?identity\s+reference\.?\s*/i;

export function sceneText(text: string, n: number): string {
  let t = String(text || "").trim();
  t = t.replace(OPENER, "");
  t = t.replace(/\bthe\s+uploaded\s+(?:character\s+)?(?:reference\s+)?sheet\b/gi, "@image1").replace(/\bthe\s+(?:character|reference)\s+sheet\b/gi, "@image1");
  t = t.replace(/@image(\d+)\b/gi, (_m, d) => (+d >= 1 && +d <= n ? "@image" + d : "@image1"));
  return t.replace(/@(?!image\d)[A-Za-z][\w-]*\b/g, "@image1");
}

/** OUTFIT LOCK: the references are for identity only, never for clothing. */
export function outfitLock(refs: string, outfit: string | undefined, sheetOutfit: string | undefined, mode: "target" | "change" | "prompt"): string {
  const o = String(outfit || "").replace(/\s+/g, " ").trim().replace(/\.$/, "").slice(0, 300);
  const so = String(sheetOutfit || "").replace(/\s+/g, " ").trim().replace(/\.$/, "").slice(0, 140);
  const wear =
    mode === "target"
      ? `She wears exactly the outfit worn in @image1${o ? ` (${o})` : ""}, garment for garment.`
      : mode === "change"
        ? `She wears ${o ? o + ", " : "the outfit given in the change below, "}not the clothing from the reference images.`
        : o
          ? `She wears ${o}, exactly as described in this prompt.`
          : "She wears only the outfit described in this prompt.";
  return ` OUTFIT LOCK: ${wear} The clothing in ${refs} is a placeholder${so ? ` (${so})` : ""}, never worn.`;
}

export function refOutfitGuard(refs: string, photo: string, so?: string): string {
  return `Ignore the clothing in ${refs}, a placeholder${so ? ` (${so})` : ""}: she wears only the outfit of ${photo}, or the new outfit this edit describes.`;
}

/** The outfit sentence of a prompt made from her references alone. */
const wearLine = (outfit: string | undefined) => {
  const o = String(outfit || "").replace(/\s+/g, " ").trim().replace(/\.$/, "").slice(0, 300);
  return o ? `She wears only ${o}.` : "She wears only the outfit described in this prompt.";
};

/**
 * Identity lock when there is no sheet pack: the whole sheet, or up to 3 reference photos, are the only images sent.
 * `ol` is extra wording for the end (the outfit lock, the overlay rule).
 */
export function lockRefs(text: string, n: number, isSheet: boolean, ol: string): string {
  n = Math.max(1, Math.min(n || 1, 3));
  const t = sceneText(text, n);
  const tags = tagList(n);
  const R = { roles: tags.map(() => (isSheet ? "her character reference sheet" : "a reference photo of her")), kinds: tags.map(() => (isSheet ? "body" : "photo")) };
  const head = sentences(refRoles(R, tags), n > 1 && "They all show the same woman.", priority());
  const tail = sentences((ol || "").trim(), personOnly(tags, isSheet), !hasQualityLine(t) && REALISM_FIX.quality, !/gibberish|garbled/i.test(t) && TEXT_SHORT);
  return paragraphs(head, t, tail);
}

/**
 * Which framing an image model gets, from its id: Seedream ("pro", which also covers 4.5), Nano Banana ("nb"), or the
 * general one every other model gets. People bring their own image model, so this reads the id rather than a list.
 */
export type ModelFamily = "pro" | "nb" | "other";
export function modelFamily(modelId: string): ModelFamily {
  const m = modelId.toLowerCase();
  if (/seedream/.test(m)) return "pro";
  if (/nano[- ]?banana|gemini/.test(m)) return "nb";
  return "other";
}

/** References as the generators get them: each image's role and kind, in @image order. */
export interface RefSet {
  roles: string[];
  kinds: string[];
  anchors: Anchors | null;
}

/** Model-specific identity framing around the LLM's scene prompt (text + her references). Needs pack references. */
/**
 * Recreate: the new image keeps the image quality and shading the written prompt describes (from the target), and she is
 * lit by the scene, never by the reference sheets' flat studio light.
 */
export const QUALITY_SHADING_MATCH = "Light her with the scene's own light, as described above, never the references' flat studio light.";

/** Edit: the edited photo keeps @image1's own image quality and shading, and she is lit by its light. */
export const QUALITY_SHADING_KEEP =
  "She is lit and shaded by @image1's own light: the same direction, contrast, shadow depth and softness, and colour of light on her skin, hair and clothes as on everything around her. Keep @image1's image quality exactly: the same sharpness, noise or grain, compression and colour grade; never make it cleaner, sharper or more evenly lit.";

export function framePrompt(
  _mk: ModelFamily,
  text: string,
  R: RefSet,
  frame: string | undefined,
  ox: { outfit?: string; clean?: boolean; realism?: boolean } = {},
): string {
  // One framing for every image model: the lean order (image roles, her fixed block, priority, scene, guards).
  const n = R.roles.length;
  const tags = tagList(n);
  const block = identityBlock(R.anchors, frame);
  // The written scene may already carry her block (Inject shows it in the prompt): it is said once, up here.
  const t = bodyScrub(sceneText(text, n), R.anchors).replace(block || "\u0000", "").replace(/\n{3,}/g, "\n\n").trim();
  const sheet = R.kinds.some(isSheetKind);
  const head = sentences(refRoles(R, tags), n > 1 && "They all show the same woman.");
  const tail = sentences(
    wearLine(ox.outfit),
    personOnly(tags, sheet, R.anchors?.sheetOutfit),
    ox.clean && OVERLAY_RULE,
    // Realism off (Director): the scene's own look stands, with no photo-quality lines added.
    ox.realism === false ? "Keep the look, light and style described above." : sentences(QUALITY_SHADING_MATCH, !hasQualityLine(t) && REALISM_FIX.quality),
    !/gibberish|garbled/i.test(t) && TEXT_SHORT,
  );
  return paragraphs(head, block, sentences(priority(), tattooLine(block)), t, tail);
}

/** What a photo edit may change; everything else in the target is kept. */
export interface Changes {
  pose?: boolean;
  outfit?: boolean;
  hair?: boolean;
  who?: string;
  outfitText?: string;
  clean?: boolean;
}

/**
 * A swap into a photo: @image1 is the photo, @image2 onwards are her references. Direct swap and Inject's "Swap into
 * photo" both use it; `change` is what an Inject version alters, and `keep` lists what stays.
 */
export function swapCore(R: RefSet, o: { who?: string; frame?: string; keep: string[]; change?: string; outfitChanges?: boolean; outfitText?: string; clean?: boolean; poseChanges?: boolean }): string {
  const tags = R.roles.map((_, i) => "@image" + (i + 2));
  const block = identityBlock(R.anchors, o.frame);
  const sheet = R.kinds.some(isSheetKind);
  const who = o.who?.trim() ? ` ${fence(o.who).replace(/\s+/g, " ").trim().slice(0, 60)}` : "";
  const ch = String(o.change || "").replace(/\s+/g, " ").trim().replace(/^none\.?$/i, "");
  const outfit = String(o.outfitText || "").replace(/\s+/g, " ").trim().replace(/\.$/, "").slice(0, 300);
  const wear = o.outfitChanges
    ? `She wears ${outfit || "the outfit the change describes"}, not the outfit in @image1.`
    : `She wears exactly the outfit in @image1${outfit ? ` (${outfit})` : ""}, garment for garment.`;
  return paragraphs(
    sentences(
      `Replace the person${who} in @image1 with the woman from ${joinTags(tags)}.`,
      `@image1 is the photo to keep: its ${o.keep.join(", ")} stay exactly as they are${ch ? ", apart from the change below" : ""}.`,
      refRoles(R, tags),
    ),
    block,
    sentences(priority("the photo"), "Her body replaces the original person's completely, with none of that person's tattoos, piercings or marks.", tattooLine(block)),
    sentences(ch && `Change: ${ch.replace(/\.?$/, ".")}`, o.poseChanges && "Adjust the framing only as much as the new pose needs.", wear, personOnly(tags, sheet, R.anchors?.sheetOutfit)),
    sentences(realKeep("@image1"), "A drawing or render becomes a real photograph, and garbled text becomes short, clean wording.", o.clean && OVERLAY_RULE),
  );
}

/** Inject's photo edit: the target is @image1, her references follow, and only the version's EDIT line changes. */
export function basePrompt(R: RefSet, edit: string | undefined, frame: string | undefined, chg: Changes = {}): string {
  const keep = ["expression and gaze", "makeup", !chg.pose && "pose and hand placement", !chg.outfit && "outfit and accessories", !chg.hair && "hairstyle", "props", "background", "light and shadows", "framing", "camera look"].filter(
    (x): x is string => !!x,
  );
  return swapCore(R, { who: chg.who, frame, keep, change: edit, outfitChanges: chg.outfit, outfitText: chg.outfitText, clean: chg.clean, poseChanges: chg.pose });
}

/** Points every @imageN in a prompt at an image that is actually sent (out-of-range tags become @image1). */
export const clampTags = (prompt: string, n: number) => String(prompt).replace(/@image(\d+)\b/gi, (_m, d) => (+d >= 1 && +d <= Math.max(1, n) ? "@image" + d : "@image1"));

/**
 * Shortens only the written scene of an Inject prompt, so the identity framing and BODY LOCK around it are sent whole.
 * Her body comes first in what must survive, then everything the scene shows.
 */
export const sceneCondenseTask = (t: string, max: number) =>
  `Shorten this image prompt's scene description to at most ${max} characters. Say every detail once and drop repetition and filler, but keep, in this order of priority: (1) her body, build and proportions exactly as written, with every proportion word; (2) her face, hair and marks; (3) the pose limb by limb with left and right, expression and gaze; (4) every garment, shoe and accessory with its colour, fabric and fit; (5) the setting and props; (6) the light source, direction and shadows; (7) the camera, image quality and skin realism; (8) the exclusions and negatives. Keep every @imageN tag and every quoted word exactly. Output only the shortened text.\n<<<${fence(t)}>>>`;

/** Artifact condensePrompt request, for image models with a short prompt limit. */
export const condenseTask = (t: string, max: number) =>
  `Rewrite this image-edit prompt in at most ${max - 40} characters. Keep every @imageN tag and what each image is for, the woman's identity, hair, body proportions, the pose, outfit, setting, light, shading, image quality, camera look and the no-text, no-piercing and tattoos-only-on-bare-skin rules; drop filler and repetition. Output only the prompt.\n<<<${fence(t)}>>>`;
