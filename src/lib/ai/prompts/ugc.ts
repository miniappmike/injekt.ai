/**
 * UGC: her with a product, in a photo that looks like she (or a friend) took it on a phone. Two steps: a vision model
 * reads the product photos and plans the shots (ugcPlanPrompt), then each shot becomes a short image prompt (ugcPrompt).
 *
 * The image prompt is deliberately lean (about 1,100 to 1,400 characters): one role per image, each rule said once, her
 * look left to the reference images apart from her marks. Seedream follows short prompts with clear image roles more
 * closely than long ones. Pure, so the server and the tests share it.
 */
import { fence, joinTags } from "./rules";
import type { Anchors, RefSet } from "./identity";
import { MAX_UGC_SHOTS, type UgcProduct, type UgcShot } from "@/lib/ugc-meta";

const one = (v: unknown, max: number) =>
  String(typeof v === "string" ? v : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
/** A phrase to drop into a sentence: no final full stop. */
const phrase = (v: unknown, max: number) => one(v, max).replace(/[.\s]+$/, "");

/** The plan request. The product photos are the only images sent with it. */
export function ugcPlanPrompt(o: { photos: number; shots: number; note?: string; avoid?: string[] }): string {
  const n = Math.min(Math.max(Math.round(o.shots) || 1, 1), MAX_UGC_SHOTS);
  const note = fence(o.note ?? "").replace(/\s+/g, " ").trim();
  const avoid = (o.avoid ?? []).map((x) => one(fence(x), 60)).filter(Boolean).slice(0, 8);
  return `TASK: The attached ${o.photos > 1 ? `${o.photos} images show one product (the same product from different angles, or the items of one set)` : "image shows a product"}. Plan ${n > 1 ? `${n} different photos` : "one photo"} of a woman showing it off, the kind of photo a real customer or creator posts (UGC, user-generated content). An image model makes each photo from your plan, the product ${o.photos > 1 ? "photos" : "photo"} and reference images of the woman.

STEP 1, READ THE PRODUCT. Work out what it is, who buys it, where and when it is really used or worn, and the look it gives off through its colours, graphics, materials and branding. That look decides everything else.
- A bucket hat with a palm tree print belongs somewhere sunny and coastal: a beach, a boardwalk, a pool deck.
- A tub of workout powder belongs in a home gym, a yoga studio or a kitchen counter after training.
- A skincare serum belongs at a bathroom mirror in soft morning light; a scented candle in a cosy living room at dusk; hiking boots on a trail.
Never pick a place that merely looks nice: pick the place this product's own buyer would be in.

STEP 2, PLAN THE PHOTO${n > 1 ? "S" : ""}.
- AESTHETIC: the place, her outfit, the light, the time of day and the mood all come from the product's look${n > 1 ? `. Every photo fits it, but each is in a different place or moment and uses a different framing` : ""}.
- IT LOOKS LIKE UGC: taken on a phone by her or by a friend. Choose one framing${n > 1 ? " per photo" : ""}: a selfie at arm's length, a mirror selfie, the phone propped up nearby, or a friend's candid shot. Casual, slightly off-centre framing in a real, lived-in place with a few ordinary things around. Never a studio, an advert layout, a posed catalogue shot or a clean backdrop.
- THE PRODUCT IS THE POINT: clearly visible, in focus, not cropped and not hidden by her fingers, its front or label turned to the camera, at its real size. She holds, wears or uses it the way real people do, with a relaxed, genuine expression.
- HER: call her "she". Never describe her face, hair, skin, body or age; the reference images carry who she is. Describe only what she does, her pose and her expression. She is an adult woman.
- OUTFIT: everyday clothes that suit the place and the product, each garment named with its colour. If the product is something she wears (a hat, clothing, jewellery, shoes, a bag), set "worn" to true, list only the rest of her outfit, and frame the photo so the product is fully in view.
- LIGHT: name the source and its direction (for example low afternoon sun from the left, a window behind the phone, warm lamp light from the right). Never just "natural light".
- No other brands, no visible text besides the product's own, no captions or stickers. Never use the words flawless, glossy, glowing, radiant, perfect, polished, photorealistic or 8k.${avoid.length ? `\n- Already used, so plan something clearly different: ${avoid.join("; ")}.` : ""}${note ? `\n- Direction from the user, followed where it applies to the photo: <<<${note}>>>` : ""}

Reply with only JSON:
{"product": "what it is in at most 25 words: type, brand name if readable, colours, material, and its print or graphic", "label": "the main words printed on it, exactly as spelled, at most 8 words, or an empty string", "aesthetic": "the look it gives off, at most 10 words", "worn": false, "shots": [{"title": "the place or moment, at most 5 words", "action": "what she does with the product, at most 22 words, written to follow the word She (for example: holds the tub up beside her face with the label facing the camera)", "scene": "45 to 70 words: the place with two or three concrete details, her pose and expression, who holds the phone and from where, the time of day and the light", "outfit": "at most 25 words"}]}
"shots" has exactly ${n} ${n > 1 ? "entries" : "entry"}.`;
}

/** Reads the plan reply. Throws when nothing usable came back. */
export function parseUgcPlan(raw: unknown, shots: number): { product: UgcProduct; shots: UgcShot[] } {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const product: UgcProduct = {
    product: phrase(r.product, 300),
    label: one(r.label, 80).replace(/^["'“”]+|["'“”.]+$/g, ""),
    aesthetic: phrase(r.aesthetic, 120),
    worn: r.worn === true,
  };
  const list = (Array.isArray(r.shots) ? r.shots : [])
    .map((s): UgcShot | null => {
      if (!s || typeof s !== "object") return null;
      const x = s as Record<string, unknown>;
      const shot = { title: phrase(x.title, 60), action: phrase(x.action, 220).replace(/^she\s+/i, ""), scene: one(x.scene, 700), outfit: phrase(x.outfit, 250) };
      return shot.action && shot.scene ? { ...shot, title: shot.title || "UGC photo" } : null;
    })
    .filter((s): s is UgcShot => !!s)
    .slice(0, Math.min(Math.max(shots, 1), MAX_UGC_SHOTS));
  if (!product.product || !list.length) throw new Error("The product couldn't be read. Try a clearer photo of it.");
  return { product, shots: list };
}

const MARK = /tattoo|pierc|\bring\b|\bstud\b|\bmoles?\b|freckl|scar\b|birthmark|beauty mark|dimple|tooth gap|gap between/i;

/** Her distinctive marks from the sheet's words (piercings, tattoos, moles, freckles): what a model most often drops. */
export function marksOf(a: Anchors | null | undefined): string[] {
  const parts = [a?.face, a?.skin]
    .filter((x): x is string => !!x)
    .flatMap((x) => x.split(/[,;]/))
    .map((x) => x.replace(/\s+/g, " ").trim().replace(/\.$/, ""))
    .filter((x) => x && MARK.test(x));
  return [...new Set(parts)].slice(0, 4).map((x) => x.slice(0, 80));
}

/**
 * The image prompt for one shot. Her references are @image1 onwards (R, in the order sent) and the product photos
 * follow them.
 */
export function ugcPrompt(R: RefSet, products: number, p: UgcProduct, shot: UgcShot): string {
  const n = R.roles.length;
  const refTags = R.roles.map((_, i) => "@image" + (i + 1));
  const refs = joinTags(refTags);
  const prodTags = Array.from({ length: Math.max(1, products) }, (_, i) => "@image" + (n + i + 1));
  const face = refTags.filter((_, i) => R.kinds[i] === "faces");
  const body = refTags.filter((_, i) => R.kinds[i] === "body");
  const BODY = "body proportions (bust, waist, hips, glutes, thighs, shoulders)";
  const who =
    face.length && body.length
      ? `The woman is the one in ${refs}: her exact face, hair and piercings from ${joinTags(face)} (her face sheet), and her exact ${BODY} and tattoos from ${joinTags(body)} (her body sheet).`
      : face.length
        ? `The woman is the one in ${refs} (her face sheet): her exact face, hair, skin tone and piercings.`
        : body.length
          ? `The woman is the one in ${refs} (her reference sheet): her exact face, hair, ${BODY}, tattoos and piercings.`
          : `The woman is the one in ${refs}${n > 1 ? ", reference photos of the same woman" : ", a reference photo of her"}: her exact face, hair, ${BODY}, tattoos and piercings.`;
  const marks = marksOf(R.anchors);
  const tattoo = marks.some((m) => /tattoo/i.test(m));
  const identity = [
    who,
    marks.length ? `Her marks: ${marks.join("; ")}.` : "",
    tattoo ? "Tattoos show only on bare skin, never on clothing." : "",
    face.length && !body.length ? "" : "Keep her proportions at their real scale, never slimmed or averaged.",
  ]
    .filter(Boolean)
    .join(" ");

  const product = phrase(p.product, 300);
  const label = one(p.label, 80).replace(/["“”]/g, "");
  const item = [
    `She ${phrase(shot.action, 220).replace(/^she\s+/i, "")}.`,
    `It is the exact product from ${joinTags(prodTags)}${prodTags.length > 1 ? " (the same product in each)" : ""}${product ? `: ${product}` : ""}.`,
    `Keep its shape, colours, materials, logo and printed text exactly as in ${prodTags[0]}${label ? `, reading "${label}"` : ""}, at its real size, clearly visible and in focus.`,
  ].join(" ");

  const outfit = phrase(shot.outfit, 250);
  const sheet = R.kinds.length > 0;
  const wear = outfit
    ? `She wears ${p.worn ? "the product with " : ""}${outfit}, never the ${sheet ? "plain outfit in the reference sheets" : "clothes in the reference photos"}.`
    : `Her clothes suit the scene, never the ${sheet ? "plain outfit in the reference sheets" : "clothes in the reference photos"}.`;
  const scene = one(shot.scene, 700).replace(/\s*$/, "").replace(/([^.!?])$/, "$1.");
  const look = `Realistic skin texture with pores and small imperfections, real smartphone image grain, natural depth, lighting and shadows. No shiny, glossy or waxy skin. No overlays, captions or watermarks. Take only the person from ${refs}, never ${sheet ? (n > 1 ? "their grids or plain backgrounds" : "its grid or plain background") : n > 1 ? "their backgrounds or poses" : "its background or pose"}.`;

  return ["A candid smartphone photo a creator posted, not an advert.", identity, item, scene, wear, look].join("\n\n");
}
