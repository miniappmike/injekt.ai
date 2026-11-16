/**
 * UGC: her with a product, in a photo that looks like she (or a friend) took it on a phone. Two steps: a vision model
 * reads the product photos and plans the shots (ugcPlanPrompt), then each shot becomes a short image prompt (ugcPrompt).
 *
 * The image prompt is built from the lean blocks in ./lean.ts: one role per image, her fixed identity block, her identity
 * above the scene, then the shot, in separate paragraphs. Pure, so the server and the tests share it.
 */
import { fence, joinTags } from "./rules";
import type { RefSet } from "./identity";
import { identityBlock, isSheetKind, paragraphs, personOnly, priority, REAL_NEW, refRoles, sentences, tattooLine } from "./lean";
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
- ONLY WHAT IS IN FRAME: decide the framing first and list it in "frame", then describe only what it shows: no shoes for a waist-up selfie, no expression when she faces away.
- OUTFIT: everyday clothes that suit the place and the product, each garment named with its colour. If the product is something she wears (a hat, clothing, jewellery, shoes, a bag), set "worn" to true, list only the rest of her outfit, and frame the photo so the product is fully in view.
- LIGHT: name the source and its direction (for example low afternoon sun from the left, a window behind the phone, warm lamp light from the right). Never just "natural light".
- No other brands, no visible text besides the product's own, no captions or stickers. Never use the words flawless, glossy, glowing, radiant, perfect, polished, photorealistic or 8k.${avoid.length ? `\n- Already used, so plan something clearly different: ${avoid.join("; ")}.` : ""}${note ? `\n- Direction from the user, followed where it applies to the photo: <<<${note}>>>` : ""}

Reply with only JSON:
{"product": "what it is in at most 25 words: type, brand name if readable, colours, material, and its print or graphic", "label": "the main words printed on it, exactly as spelled, at most 8 words, or an empty string", "aesthetic": "the look it gives off, at most 10 words", "worn": false, "shots": [{"title": "the place or moment, at most 5 words", "action": "what she does with the product, at most 22 words, written to follow the word She (for example: holds the tub up beside her face with the label facing the camera)", "scene": "45 to 70 words: the place with two or three concrete details, her pose and expression, who holds the phone and from where, the depth (one thing near the lens, her in the middle, what is far behind), the time of day and the light", "outfit": "at most 25 words, only garments that are in frame", "frame": "the parts of her this photo shows, chosen from: face, back of head, hair, shoulders, bust, arms, waist, hips, glutes, thighs, legs, feet"}]}
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
      const shot = { title: phrase(x.title, 60), action: phrase(x.action, 220).replace(/^she\s+/i, ""), scene: one(x.scene, 700), outfit: phrase(x.outfit, 250), frame: phrase(x.frame, 200).toLowerCase() };
      return shot.action && shot.scene ? { ...shot, title: shot.title || "UGC photo" } : null;
    })
    .filter((s): s is UgcShot => !!s)
    .slice(0, Math.min(Math.max(shots, 1), MAX_UGC_SHOTS));
  if (!product.product || !list.length) throw new Error("The product couldn't be read. Try a clearer photo of it.");
  return { product, shots: list };
}

/**
 * The image prompt for one shot. Her references are @image1 onwards (R, in the order sent) and the product photos
 * follow them.
 */
export function ugcPrompt(R: RefSet, products: number, p: UgcProduct, shot: UgcShot): string {
  const n = R.roles.length;
  const refTags = R.roles.map((_, i) => "@image" + (i + 1));
  const prodTags = Array.from({ length: Math.max(1, products) }, (_, i) => "@image" + (n + i + 1));
  const sheet = R.kinds.some(isSheetKind);
  const block = identityBlock(R.anchors, shot.frame);
  const product = phrase(p.product, 300);
  const label = one(p.label, 80).replace(/["“”]/g, "");
  const outfit = phrase(shot.outfit, 250);
  const scene = one(shot.scene, 700).replace(/([^.!?])$/, "$1.");
  return paragraphs(
    sentences(
      "A candid smartphone photo a creator posted, not an advert.",
      refRoles(R, refTags),
      `${joinTags(prodTags)} ${prodTags.length > 1 ? "show the product (the same product in each)" : "is the product"}${product ? `: ${product}` : ""}. Keep its shape, colours, materials, logo and printed text exactly${label ? `, reading "${label}"` : ""}, at its real size.`,
    ),
    block,
    sentences(priority(), tattooLine(block)),
    sentences(`She ${phrase(shot.action, 220).replace(/^she\s+/i, "")}, the product clearly visible and in focus.`, scene),
    sentences(outfit ? `She wears ${p.worn ? "the product with " : ""}${outfit}.` : "Her clothes suit the scene.", personOnly(refTags, sheet, R.anchors?.sheetOutfit)),
    REAL_NEW,
  );
}
