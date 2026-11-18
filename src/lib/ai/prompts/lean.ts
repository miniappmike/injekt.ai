/**
 * The lean building blocks every image prompt is made from. Seedream follows a short prompt more closely than a long
 * one, so each prompt says five things once, in this order:
 *   1. what each image is and what to take from it (one role per image, named by its @image tag);
 *   2. her fixed identity block, word for word the same in every prompt for the same character, in its own paragraph;
 *   3. that her identity outranks the scene;
 *   4. the scene, outfit or change, in a separate paragraph from her identity;
 *   5. one outfit guard and one realism line.
 * Pure, so the server and the tests share it.
 */
import { joinTags } from "./rules";
import type { Anchors } from "./identity";

export const BODY_PARTS = "body proportions (bust, waist, hips, glutes, thighs, shoulders)";

const FACE_KINDS = new Set(["faces", "front"]);
const BODY_KINDS = new Set(["body", "side"]);

/** True when a reference is one of her sheets (or a crop of one), not a loose photo. */
export const isSheetKind = (k: string | undefined) => !!k && (FACE_KINDS.has(k) || BODY_KINDS.has(k));

/** "@image2 is her face sheet: take her exact face, hair and piercings. @image3 is ...": one role per reference. */
export function refRoles(R: { roles: string[]; kinds: string[] }, tags: string[]): string {
  const hasFace = R.kinds.some((k) => FACE_KINDS.has(k));
  const hasBody = R.kinds.some((k) => BODY_KINDS.has(k));
  return tags
    .map((t, i) => {
      const k = R.kinds[i];
      const take = FACE_KINDS.has(k)
        ? hasBody
          ? "take her exact face, hair and piercings"
          : "take her exact face, hair, skin tone and piercings"
        : BODY_KINDS.has(k)
          ? hasFace
            ? `take her exact ${BODY_PARTS} and tattoos`
            : `take her exact face, hair, ${BODY_PARTS}, tattoos and piercings`
          : `take her exact face, hair, ${BODY_PARTS}, tattoos and piercings`;
      return `${t} is ${R.roles[i] || "a reference photo of her"}: ${take}.`;
    })
    .join(" ");
}

const clip = (s: string | undefined, n: number) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,\s]+$/, "")
    .slice(0, n);

/** Which parts of her are in frame, from an IN FRAME line. An empty frame means all of her. */
function inFrame(frame?: string) {
  const f = String(frame || "").toLowerCase();
  const all = !f.trim();
  const has = (re: RegExp) => all || re.test(f);
  return { face: has(/face/), hair: has(/hair|face|head/), upper: has(/shoulder|bust|chest|arm|upper|torso/), mid: has(/waist|hip|glute|torso/), legs: has(/thigh|leg|feet|foot|knee|full/) };
}

/**
 * Her identity block: face, hair, skin and build from her sheet pack, word for word. The same character gets the same
 * words in every prompt (only parts out of frame are left out), because a description that varies between generations
 * reads to the model as permission to drift. Empty when she has no sheet pack.
 */
export function identityBlock(a: Anchors | null | undefined, frame?: string): string {
  if (!a) return "";
  const v = inFrame(frame);
  const build = [v.upper && clip(a.upper, 110), v.mid && clip(a.mid, 110), v.legs && clip(a.legs, 90)].filter(Boolean).join("; ");
  const parts = [v.face && a.face && `Face: ${clip(a.face, 200)}.`, v.hair && a.hair && `Hair: ${clip(a.hair, 140)}.`, a.skin && `Skin: ${clip(a.skin, 170)}.`, build && `Build: ${build}.`].filter(Boolean);
  return parts.length ? `HER LOOK (fixed, the same in every image): ${parts.join(" ")}` : "";
}

/** Her identity outranks everything else in the prompt. `rest` names what comes second ("the scene", "the artwork"). */
export const priority = (rest = "the scene") =>
  `Her identity from the references is the highest priority: the same face and the same body at its real scale, never slimmed, enlarged, idealised or averaged. ${rest[0].toUpperCase() + rest.slice(1)} is secondary and never changes her.`;

/** Tattoos stay on skin: added only when her block mentions one. */
export const tattooLine = (block: string) => (/tattoo/i.test(block) ? "Her tattoos show only on bare skin, never on clothing." : "");

/** Only the person comes from her references, never the sheet itself or what she wears in it. */
export function personOnly(refs: string[], sheet: boolean, sheetOutfit?: string): string {
  const many = refs.length > 1;
  const so = clip(sheetOutfit, 120);
  return sheet
    ? `Take only the person from ${joinTags(refs)}, never ${many ? "their" : "its"} grid, plain background, studio light or plain outfit${so ? ` (${so})` : ""}.`
    : `Take only the person from ${joinTags(refs)}, never ${many ? "their" : "its"} background, outfit, pose or lighting.`;
}

/** An edit keeps the photo's own look. */
export const realKeep = (photo: string) =>
  `Match ${photo}'s own light, shadows, grain and image quality, never cleaner or sharper. Realistic skin texture with pores and small imperfections; no glossy, waxy or airbrushed skin.`;

/** A new image: the look of a photo from a 2000s digital camera, which reads as real where a clean render does not. */
export const REAL_NEW =
  "Shot on an early-to-mid 2000s digital camera: CCD colour, slight softness, real image grain, natural depth, lighting and shadows. Realistic skin texture with pores and small imperfections; no glossy, waxy or airbrushed skin. No overlays, captions or watermarks.";

/** Joins paragraphs, dropping empty ones. */
export const paragraphs = (...p: (string | false | null | undefined)[]) => p.filter((x): x is string => !!x && !!x.trim()).join("\n\n");
/** Joins sentences, dropping empty ones. */
export const sentences = (...p: (string | false | null | undefined)[]) => p.filter((x): x is string => !!x && !!x.trim()).join(" ");
