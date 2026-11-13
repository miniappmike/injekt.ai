/**
 * Variants (artifact A11) and the carousel creative director (A20, A20b), word for word. ModelSpawn additions, marked
 * where they are: her sheets can be two images (face and body), the person may add up to 2 extra images for the vibe or
 * outfit, and the carousel's nudity sentence is left out (no app-level screening).
 */
import { asksMakeup, hasQualityLine, BODY_LOCK, fence, joinTags, makeupRule, MODS_RULE, REALISM_FIX, SKIN_ART_SHORT, TEXT_RULE } from "./rules";
import { harness } from "./harness";
import { pickAnchors, refOutfitGuard, type Anchors } from "./identity";
import type { CarouselTypeId, PlatformId, SlidePerson, VariantDimId } from "@/lib/variants-meta";

const DIM_TEXT: Record<VariantDimId, string> = {
  pose: "pose",
  angle: "camera angle",
  expression: "expression",
  hair: "hairstyle",
  scene: "scene and location",
  colours: "outfit colours",
  outfit: "wardrobe swap to a completely different outfit",
  light: "light or time of day",
};
export const dimText = (ids: VariantDimId[]) => ids.map((id) => DIM_TEXT[id]).filter(Boolean);

/** How the images are tagged for a variant edit: her references first, then the photo, then any extras. */
export interface VariantTags {
  /** Her reference tags joined ("@image1" or "@image1 and @image2"); empty with no character. */
  ref: string;
  refCount: number;
  /** "character reference sheet", "character reference sheets", "character reference photo". */
  refKind: string;
  photo: string;
  extras: string[];
}

export function variantTags(refCount: number, isSheet: boolean, extraCount: number): VariantTags {
  const refs = Array.from({ length: refCount }, (_, i) => "@image" + (i + 1));
  const photo = "@image" + (refCount + 1);
  return {
    ref: joinTags(refs),
    refCount,
    refKind: `character reference ${isSheet ? "sheet" : "photo"}${refCount > 1 ? "s" : ""}`,
    photo,
    extras: Array.from({ length: extraCount }, (_, i) => "@image" + (refCount + 2 + i)),
  };
}

export interface VariantPromptInput {
  n: number;
  dims: string[];
  /** With a character: her tags; without one, null. */
  vt: VariantTags | null;
  traits: string;
  /** Her sheet's placeholder outfit, to keep out. */
  so: string;
  recent: string[];
  inspo: string[];
  hairExamples: string[];
  extra: string;
  /** Without a character: the tags of the extra images (they follow the photo, @image2 onwards). */
  extraTags?: string[];
  /** No outfit or colour change is on: the writer describes the outfit once and every edit carries it word for word. */
  lockOutfit?: boolean;
  /** With the outfit locked and "Outfit colours" on: the one palette every edit's outfit is recoloured with. */
  palette?: string;
}

/**
 * Variants keep one outfit across the whole set unless a different outfit is asked for. With "Outfit colours" on, the
 * outfit is recoloured once (one palette for the set) and that recoloured outfit is the one every edit keeps. Colours
 * alone would make every edit the same, so then each edit recolours on its own as before.
 */
export const locksOutfit = (dims: string[]) => !dims.includes("outfit") && dims.some((d) => d !== "colours");

/** Artifact writeVariants prompt. */
export function variantPrompt(o: VariantPromptInput): string {
  const { n, dims, vt, extra } = o;
  const two = !!vt;
  const isAre = vt && vt.refCount > 1 ? "are" : "is";
  return `TASK: The attached image is a finished photo from an AI image generator. Write ${n} short EDIT prompts the user will paste into their generator's edit mode, with this same image loaded${two ? ` as ${vt.photo} and the ${vt.refKind} loaded as ${vt.ref}` : ""}, to get new takes on it.
${two ? `IMAGE TAGS (use exactly these, never swap them): ${vt.ref} ${isAre} the ${vt.refKind}, the identity source of truth for the face, hair and body. ${vt.photo} is the photo being edited (the attached image). Every edit changes ${vt.photo} and keeps the person identical to ${vt.ref}. Never call the photo ${vt.ref} or the reference ${vt.photo}, and never describe the layout, grid, panels or grey background of the reference.` : ""}

Each edit keeps EVERYTHING the same (the same person and face, hair, body, makeup, nail polish, outfit, accessories, overall style, colour grade, light quality, camera look and realism) except what that edit changes. Things that may change: ${dims.join(", ")}. Each edit changes one or two of these, and together the ${n} edits should cover them with variety.
${o.traits ? `The person is this character; restate their 3 to 5 most recognisable traits that are visible in this image (skip any that are out of frame or hidden) in each edit so the face does not drift: ${fence(o.traits)}` : ""}
RULES
- ${two ? `Start every edit with "Edit ${vt.photo}. Keep the person exactly as she looks in ${vt.ref}: same face, features, skin, hair, body shape and proportions. Keep the outfit and photo style of ${vt.photo}." then the change.` : 'Start every edit with "Keep the same person, outfit and photo style." then the change.'}
- Read the image's vibe (setting, props, mood, camera position) so each change fits it. Poses are fresh, eye-catching social media poses: confident, playful or candid, physically plausible and non-sexual. Describe a new pose limb by limb with left and right, plus expression and gaze.
- A camera angle change names the new position and framing (for example low angle from hip height, high angle from above, profile from the left, tighter head-and-shoulders crop, wider full-body shot).
- A scene change keeps the same light quality, colour grade and camera style in the new place.
- An outfit colour change keeps every garment and only names the new colours.
- A different-outfit change replaces all the clothing with a completely new outfit that keeps the image's vibe, aesthetic, colour story and level of dressiness and makes sense for the scene; it overrides "keep the outfit" for that edit. Name every garment with its type, fabric, fit and colour, plus shoes if in frame; real brands are fine where they fit. Every different-outfit edit uses a different outfit.
- A hairstyle change restyles the hair only (for example ${o.hairExamples.join("; ")}) and keeps the exact hair colour, length, texture, highlights and face. If the hair is too short for a style, pick one that suits its length. Every hairstyle edit uses a different style.
${two ? `- ${vt.ref} shows her in a plain placeholder outfit${o.so ? ` (${o.so})` : ""}. Never describe or reuse it: the outfit always comes from ${vt.photo}, or from the new outfit a different-outfit edit describes.\n` : ""}- The body never changes: keep her exact build and proportions (shoulders, bust, waist, hips, glutes, legs, height) in every edit, including pose and angle changes; never slim, enlarge or idealise her.
- MAKEUP STAYS EXACTLY AS IN THE PHOTO in every edit, including expression, hairstyle, scene, light and outfit changes: the same eyeshadow, eyeliner, lashes, brows, blush, contour, lip colour and finish, and nail polish. If she wears makeup, briefly name it in each edit as something to keep (for example "keep her winged black liner, brown smoky lids and nude matte lips"). Never remove, lighten or change it${extra && asksMakeup(extra) ? ", except exactly as the user's creative direction below asks" : ""}.
- Tattoos are skin, never clothing: a tattoo shows only where its spot is bare skin. If an edit's outfit covers it, it stays hidden under the fabric and is never printed or drawn on the clothes.
- Each edit is 2 to 4 sentences, plain prose. Always describe the person as an adult. Never use "photorealistic", "8k" or similar filler.
${o.recent.length ? `- Avoid these recently used poses: ${o.recent.join("; ")}.\n` : ""}- For pose inspiration only, never copy: ${o.inspo.join("; ")}.
${o.lockOutfit ? `- OUTFIT LOCK: no edit changes the clothing${o.palette ? `, and no edit changes its colours on its own` : ""}. In "outfit", describe the outfit in the image once, garment by garment, in at most 60 words: every garment, shoe and accessory with its type, colour, fabric, finish and fit (for example "a glossy black vinyl high-waisted mini skirt, long red patent leather opera gloves above the elbow, red patent platform lace-up ankle boots with stiletto heels"). Name only what is visible.${o.palette ? ` Recolour it with this palette first: ${o.palette}. Keep every garment's type, cut, fabric, finish and fit, give each one a colour from the palette, and write the new colours into the description (the original colours never appear in it).` : ""} The app adds this exact description to every edit, so the edits themselves do not describe the outfit.\n` : ""}${extrasLine(vt ? vt.extras : (o.extraTags ?? []))}${extra ? `- Creative direction from the user, only as it applies to the image: <<<${fence(extra)}>>>\n` : ""}
Reply with only JSON: {${o.lockOutfit ? '"outfit": "the outfit in the image, garment by garment", ' : ""}"variants": [{"label": "2 to 4 word name, e.g. Low angle laugh", "changes": "pose, angle", "prompt": "the edit prompt"}]}`;
}

// ModelSpawn addition: the person's extra images (vibe, outfit) follow the photo, in this order, in their generator.
function extrasLine(tags: string[]) {
  if (!tags.length) return "";
  const them = tags.length > 1 ? "them" : "it";
  return `- The user also attached ${joinTags(tags)} after the photo, as extra image${tags.length > 1 ? "s" : ""} showing the vibe, an outfit or styling they want. Use ${them} where it fits the creative direction, and name ${them} by tag in any edit that uses ${them}.\n`;
}

/** Artifact post-processing of each variant: harness, the opener, the reference outfit guard and the makeup rule. */
export function finishVariant(prompt: string, vt: VariantTags | null, so: string, extra: string, outfit = "", recoloured = false): string {
  let t = harness(prompt, { realism: false }).text;
  if (vt && !(t.includes(vt.ref) && t.includes(vt.photo)))
    t = `Edit ${vt.photo}. Keep the person exactly as she looks in ${vt.ref}: same face, features, skin, hair, body shape and proportions. ` + t;
  // The same outfit, word for word, in every edit of the set.
  if (outfit) t = t.replace(/\s*$/, " ") + outfitKeep(outfit, vt ? vt.photo : "the photo being edited", recoloured);
  if (vt) t = t.replace(/\s*$/, " ") + refOutfitGuard(vt.ref, vt.photo, so) + " " + SKIN_ART_SHORT;
  if (!asksMakeup(extra) && !/MAKEUP STAYS/.test(t)) t = t.replace(/\s*$/, " ") + makeupRule(vt ? vt.photo : "the photo being edited");
  // ModelSpawn's standing rule: every prompt carries the realism line (the artifact relied on "keep the realism").
  if (!hasQualityLine(t)) t = t.replace(/\s*$/, " ") + REALISM_FIX.quality;
  return t;
}

/** The outfit line every variant of a set carries when no edit changes the clothes. */
export function outfitKeep(outfit: string, photo: string, recoloured = false): string {
  const o = fence(String(outfit)).replace(/\s+/g, " ").trim().replace(/\.$/, "").slice(0, 400);
  return recoloured
    ? `SAME OUTFIT, NEW COLOURS: she wears the outfit from ${photo} recoloured exactly like this: ${o}. Every garment, shoe and accessory keeps its type, cut, fabric, finish and fit from ${photo} and takes exactly these colours, which replace its colours in ${photo}; nothing is added, removed or swapped.`
    : `SAME OUTFIT: she wears exactly the outfit from ${photo}: ${o}. Every garment, shoe and accessory stays the same, with the same colours, fabrics, finish and fit; nothing is added, removed, swapped or recoloured.`;
}

// ---------- carousel ----------

const CAR_TYPES: [CarouselTypeId, string, string][] = [
  ['pose','Pose & angle','her in the same scene with a clearly different pose AND a different camera angle or distance from the cover (for example standing mirror selfie on the cover, so here a seated candid from a low angle, or a close-up over-the-shoulder shot), never a near-copy of the cover'],
  ['model_alt','Her, new spot','her somewhere else nearby that fits the same day (another corner of the place, the walk there, a car, a mirror, a café), in the same outfit'],
  ['detail','Outfit detail','a tight crop on part of her: torso and outfit, a hand holding the bag, legs and shoes, or jewellery, with her face out of frame or cropped'],
  ['flatlay','Flat lay','her outfit pieces and accessories from the image laid out on a surface from the scene, shot from above like a getting-ready shot'],
  ['object','Object close-up','a close-up of one object seen in the image (bag, shoes, flowers, camera, drink, book), styled where it would sit in the scene'],
  ['environment','The place','the place with no person in it: the room, the view, the table, the light falling across the space'],
  ['food','Food or drink','food or a drink that fits the place, time of day and aesthetic, shot casually like a phone photo'],
  ['ambient','Artsy shot','an artsy camera-quality shot around the scene: light through blinds, reflections, shadows, motion blur, flash at night or a texture detail']];

export interface CarouselPromptInput {
  n: number;
  types: CarouselTypeId[];
  hasCharacter: boolean;
  traits: string;
  extra: string;
  /** ModelSpawn addition: how many extra images the person attached after the cover. */
  extraCount: number;
  /**
   * ModelSpawn addition (Write only): the person's creative direction leads the plan instead of being a side note.
   * It overrides the default ideas and slide-type descriptions, never the identity, realism or text rules.
   */
  directionFirst?: boolean;
  /** ModelSpawn addition: poses used recently, to avoid, and a fresh handful of ideas, as Inject and Edits get. */
  recent?: string[];
  inspo?: string[];
  /** ModelSpawn addition: where the set will be posted, which sets its tone and spice. `platformOther` names "other". */
  platform?: PlatformId;
  platformOther?: string;
}

/** Subscription and bolder platforms: the poses may be flirtatious and teasing (never explicit). */
const SPICY: ReadonlySet<PlatformId> = new Set(["x", "reddit", "fanvue", "onlyfans"]);

/** ModelSpawn addition: what the platform asks of the set. */
export function platformBrief(platform: PlatformId | undefined, other = ""): string {
  const teaser = (name: string) =>
    `PLATFORM: ${name}, a subscription platform; these are teaser shots for her subscribers. Make them intimate, flirtatious and sultry, with a personal "just for you" feel: direct eye contact with the camera, bedroom, bathroom, bed and boudoir settings, lingerie, bodysuits, swimwear and revealing outfits, and teasing poses that show off her figure. Suggestive and implied, never explicit: no visible nipples or genitals and no sexual acts.`;
  switch (platform) {
    case "instagram":
      return "PLATFORM: Instagram. Feed-ready and social-safe: fashionable, confident and aspirational, flirty at most. Swimwear and fitted or revealing outfits are fine, but poses and framing stay within Instagram's guidelines.";
    case "tiktok":
      return "PLATFORM: TikTok. Playful, energetic and trend-aware, framed vertically for the feed, and social-safe like Instagram: flirty at most.";
    case "x":
      return "PLATFORM: X (Twitter). Bolder and more attention-grabbing than Instagram: confident, sultry looks at the camera, revealing outfits, and cheeky, teasing poses. Suggestive, never explicit.";
    case "reddit":
      return "PLATFORM: Reddit. It must look like a real person posted it: amateur, candid phone photos, mirror selfies and casual home settings rather than a polished shoot. Flirty and bolder than Instagram, with teasing poses and revealing outfits where they fit. Suggestive, never explicit.";
    case "fanvue":
      return teaser("Fanvue");
    case "onlyfans":
      return teaser("OnlyFans");
    case "other":
      return other.trim() ? `PLATFORM: <<<${fence(other.trim())}>>>. Match the tone, style and level of spice that fits where it will be posted, suggestive at most, never explicit.` : "";
    default:
      return "";
  }
}
/** Write only: the creative direction as the brief every slide is built around. */
export const directionBrief = (extra: string) => `
THE USER'S CREATIVE DIRECTION COMES FIRST. This is the brief for the whole set: <<<${fence(extra)}>>>
- Build every slide around it. Wherever it speaks to the setting, location, poses, outfit, styling, props, mood, light, time of day, colour story or story of the set, it decides, and it overrides the default ideas and the slide-type descriptions below (for example, if it asks for a new place, the slides move there instead of staying in the cover's place).
- Each slide's prompt must visibly carry it out: name the specific details it asks for in the prompt itself, not just the general mood, and spread its ideas across the set so every slide shows a different part of it.
- It never overrides who she is (her face, body, skin and marks from the reference), the realism rules, the text rules or the adult-only rule.
`;

/** Artifact writeCarousel prompt (the nudity sentence left out). Slides use {REF}, {PHOTO} and {EXTRA1}... placeholders. */
export function carouselPrompt(o: CarouselPromptInput): string {
  const { n, extra } = o;
  const c = o.hasCharacter;
  const allowed = CAR_TYPES.filter(([k]) => o.types.includes(k));
  const guide = allowed.map(([k, , d]) => `- ${k}: ${d}`).join("\n");
  const herTypes = allowed.filter(([k]) => k === "pose" || k === "model_alt").map(([k]) => k);
  const extraNames = Array.from({ length: o.extraCount }, (_, i) => `{EXTRA${i + 1}}`);
  return `TASK: You are the creative director for an Instagram carousel post. The attached image is a finished photo of ${c ? "the character" : "the creator"}, and it is the COVER, slide 1, already done. Plan ${n} NEW slide${n > 1 ? "s" : ""} (slides 2 to ${n + 1}) that follow the cover and grow the post into a set people stop scrolling for. Every slide must feel shot the same day by the same person, in the same place and aesthetic: the same colour grade, light quality and time of day, camera look and mood. Study the image closely first: the setting, props and objects, outfit pieces and accessories, any food or drink, textures and the overall vibe.
${o.platform ? `${platformBrief(o.platform, o.platformOther)}\n` : ""}${o.directionFirst && extra ? directionBrief(extra) : ""}
SLIDES
- Never recreate the cover. No new slide may repeat the cover's pose, camera angle, distance and framing together; a slide with her must change at least the pose and the camera angle or distance clearly, or move her somewhere new.
- Choose only from the types below.${herTypes.length ? ` At least one new slide shows her fully (type ${herTypes.join(" or ")}, person "full").` : ""}${n > 1 ? ` Do not repeat a type back to back, use ${Math.min(n, allowed.length, 3) > 1 ? `at least ${Math.min(n, allowed.length, 3)} different types` : "the type given"}, and make every slide clearly different from the cover and from each other in framing and subject. Order the slides for the best swipe flow after the cover.` : ""}
TYPES
${guide}

RULES
- Write each slide as an image-generation prompt of 3 to 6 sentences of plain prose for an edit model. The model receives {PHOTO}, the source photo, and ${c ? "{REF}, her identity reference" : "no other image"}. Use the placeholders exactly as written.
- Slides with her (pose, model_alt, detail): say she is the same woman as in ${c ? "{REF}" : "{PHOTO}"}, keep her outfit, hair and accessories from {PHOTO}, describe the new pose limb by limb with left and right, and name the new camera position and framing (for example low angle from hip height, high angle from above, side profile from the left, tight close-up, wide full-body from across the room). A detail slide keeps her face out of frame or cropped (person "partial").
- Slides without her (flatlay, object, environment, food, ambient): start with "No people in the frame." and use {PHOTO} only as the reference for the place, objects, colour grade, light and camera look (person "none").
- Name the camera and framing for each slide (phone main camera, 0.5x wide, close-up, top-down, mirror, flash at night) and the light with its source and direction. Real, unretouched social-media phone-photo quality, never glossy or CGI.
- Real brands and logos seen in the image stay accurate and named (for example a black quilted Chanel flap bag with the gold CC turn-lock). Quote any readable text exactly; never invent gibberish lettering.
- ${o.platform && SPICY.has(o.platform) ? "Poses are confident, flirtatious and teasing as the platform above calls for, never explicit." : "Poses are natural, confident or candid, and non-sexual."} Always an adult woman.
- VARIETY: every slide with her uses a clearly different body position from the cover and from each other (mix standing, sitting, lying down, kneeling, leaning, walking, crouching, from behind), with a different camera height and distance each time. Avoid the default poses every set falls back on (hand on hip facing the camera, one hand in the hair, the plain mirror selfie) unless the creative direction asks for them.
${o.recent?.length ? `- Avoid these recently used poses: ${o.recent.join("; ")}.\n` : ""}${o.inspo?.length ? `- For pose inspiration only, never copy: ${o.inspo.join("; ")}.\n` : ""}${extraNames.length ? `- The next attached image${extraNames.length > 1 ? "s are" : " is"} extra from the user, showing the vibe, an outfit or styling they want; the edit model receives ${extraNames.length > 1 ? "them" : "it"} as ${joinTags(extraNames)}. Use ${extraNames.length > 1 ? "them" : "it"} where it fits the creative direction, by placeholder.\n` : ""}${c ? `- Her recognisable traits, only where visible: ${fence(o.traits)}\n` : ""}${extra && !o.directionFirst ? `- Creative direction from the user, only as it applies to the image: <<<${fence(extra)}>>>\n` : ""}${extra && o.directionFirst ? "- Before you reply, check every slide against the user's creative direction above and rewrite any slide that does not clearly carry it out.\n" : ""}
Reply with only JSON: {"theme": "one short line naming the carousel's aesthetic", "slides": [{"type": "pose", "label": "2 to 4 word name", "person": "full", "pose": "her pose in at most 12 words, empty when she is not in it", "prompt": "..."}]}`;
}

export interface Slide {
  type: CarouselTypeId;
  label: string;
  person: SlidePerson;
  /** With {REF}, {PHOTO} and {EXTRAn} placeholders. */
  prompt: string;
  /** ModelSpawn addition: her pose in a few words, remembered so later sets avoid it. */
  pose?: string;
}

const CAR_NAME: Record<string, string> = { model: "Pose & angle", pose: "Pose & angle", model_alt: "Her, new spot", detail: "Outfit detail", flatlay: "Flat lay", object: "Object close-up", environment: "The place", food: "Food or drink", ambient: "Artsy shot" };

/** Reads the plan (artifact writeCarousel parsing). */
export function parseCarousel(raw: unknown, n: number): { theme: string; slides: Slide[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as { slides?: unknown; theme?: unknown };
  const slides = (Array.isArray(r.slides) ? r.slides : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof x.prompt === "string" && !!x.prompt.trim())
    .slice(0, n)
    .map((x) => {
      const type = String(x.type ?? "");
      return {
        type: (CAR_NAME[type] ? (type === "model" ? "pose" : type) : "pose") as CarouselTypeId,
        label: String(x.label || CAR_NAME[type] || "Slide").slice(0, 40),
        person: (["full", "partial", "none"].includes(x.person as string)
          ? x.person
          : ["model", "pose", "model_alt"].includes(type)
            ? "full"
            : type === "detail"
              ? "partial"
              : "none") as SlidePerson,
        prompt: harness(String(x.prompt), { realism: false, text: false }).text,
        ...(typeof x.pose === "string" && x.pose.trim() ? { pose: x.pose.trim().slice(0, 100) } : {}),
      };
    });
  if (!slides.length) throw new Error("The model did not plan any slides. Try again.");
  return { theme: typeof r.theme === "string" ? r.theme.slice(0, 140) : "", slides };
}

/**
 * The slide as the person copies it (artifact copyOf): her references first (face sheet @image1, body sheet @image2),
 * then the photo, then any extras. ModelSpawn change: the order is the same on every slide, including slides without
 * her, so the images are attached in one fixed order; the artifact tagged a single reference and dropped it on those.
 */
export function slideCopyText(s: Pick<Slide, "prompt" | "person">, refCount: number): string {
  const refs = Array.from({ length: refCount }, (_, i) => "@image" + (i + 1));
  const photoN = refCount + 1;
  return s.prompt
    .replace(/\{REF\}/g, refs.length ? joinTags(refs) : "@image" + photoN)
    .replace(/\{PHOTO\}/g, "@image" + photoN)
    .replace(/\{EXTRA(\d)\}/g, (_m, d) => "@image" + (photoN + Number(d)));
}

/** A slide without her, when her references still lead the image order: they are attached but not used. */
export function unusedRefsNote(refCount: number): string {
  if (!refCount) return "";
  const refs = joinTags(Array.from({ length: refCount }, (_, i) => "@image" + (i + 1)));
  return `${refs} ${refCount > 1 ? "are her reference sheets" : "is her reference"}, attached only to keep the image order; this shot has no people in it, so ignore ${refCount > 1 ? "them" : "it"}. `;
}

/** Artifact carJob: the head for who is in the slide, the slide, then quality and the rules. */
export function carouselSlidePrompt(
  slide: { person: SlidePerson; prompt: string },
  refs: { roles: string[]; anchors: Anchors | null },
  extraCount: number,
): string {
  const withHer = slide.person !== "none";
  const rt = refs.roles.map((_, k) => "@image" + (k + 1));
  const pt = "@image" + (rt.length + 1);
  const R = rt.length ? joinTags(rt) : pt;
  const t = String(slide.prompt)
    .replace(/\{REF\}/g, R)
    .replace(/\{PHOTO\}/g, pt)
    .replace(/\{EXTRA(\d)\}/g, (_m, d) => (Number(d) >= 1 && Number(d) <= extraCount ? "@image" + (rt.length + 1 + Number(d)) : pt));
  let head: string;
  if (withHer && rt.length) {
    const an = pickAnchors(refs.anchors, slide.person === "partial" ? "shoulders, arms, waist, hips, glutes, thighs, legs" : "");
    const body = [an.upper, an.mid, an.legs].filter(Boolean).join("; ");
    const so = refs.anchors?.sheetOutfit || "";
    const og = ` Use ${R} for her face, hair and body only and ignore the clothing shown there; her outfit and accessories come only from ${pt}.${so ? ` Never dress her in the reference outfit (${so}).` : ""}`;
    head =
      slide.person === "full"
        ? `Use ${R} as the strict identity reference for the woman: ${rt.map((x, k) => `${x} is ${refs.roles[k]}`).join(", ")}. Take her exact face, hair, skin, freckles and marks, and her exact body shape and proportions from them.${an.hair ? ` Hair: ${an.hair}.` : ""}${body ? ` Body: ${body}.` : ""} ${BODY_LOCK} ${pt} is the cover photo from the same shoot: match its outfit, accessories, colour grade, light and camera look, but this is a different photo. Use the new pose, camera angle and framing described below and never copy the cover's pose or composition. Take only the person from ${R}, never their grid layout, panels, plain backgrounds or plain outfit.${og}`
        : `${pt} is the source photo from the same shoot. The partly visible woman is the same woman as in ${R}: match her skin tone, freckles, marks, nails and body proportions${body ? ` (${body})` : ""}, and her outfit and accessories from ${pt}. Take only the person from ${R}, never their grid layout, panels or plain outfit.${og}`;
  } else if (withHer)
    head = `${pt} is the cover photo from the same shoot. She is the same woman as in ${pt}, with the same face, hair, skin and body, but this is a different photo: use the new pose, camera angle and framing described below and never copy the cover's pose or composition.`;
  else head = `${pt} is the source photo from the same shoot. Use it only as the reference for the place, objects, colour grade, light and camera look. No people in the frame.`;
  const t2 = withHer ? t : t.replace(/^\s*No people in the frame\.\s*/i, "");
  const quality = withHer ? REALISM_FIX.quality : REALISM_FIX.quality.split(" Skin is")[0];
  return head + "\n\n" + t2 + " " + quality + " " + TEXT_RULE + (withHer ? " " + MODS_RULE + (asksMakeup(t2) ? "" : " " + makeupRule(pt)) : "");
}
