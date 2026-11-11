/**
 * Art to Real: turns an artwork, anime or other non-photo image (@image1) into a realistic photo of a real adult woman.
 * With a character picked, her references follow as @image2 onwards and she becomes the woman in it. Pure, so the
 * server and the tests share it.
 */
import { BODY_LOCK, fence, joinTags, MODS_RULE, PROPORTIONS_RULE, REALISM_FIX } from "./rules";
import { outfitLock, pickAnchors, type RefSet } from "./identity";

const SKIN =
  "Real skin with real complexion, texture and detail: visible pores, fine peach fuzz, slight unevenness in tone and small natural imperfections. No shiny, glossy, waxy, plastic or airbrushed skin.";
const ANATOMY =
  "Realistic, anatomically correct arms, hands, fingers and limbs: five fingers on each hand, and wherever her arms or hands are seen, they are placed naturally and attach and bend the way real arms do.";
const CLOTHES =
  "Real outfit textures and clothing materials: coherent, accurate clothing that makes sense as real clothes, with real seams, folds and fabric weight.";
const SCENE =
  "A realistic real-world room or setting that matches the colours, mood and aesthetic of @image1, but with no symbols, glyphs, hieroglyphs or decorative lettering. Any text or art symbols in @image1 are cleaned up or left out. Realistic natural depth, lighting and shadows.";
const PHOTO = "Real smartphone photo quality with natural image grain.";
const NOT_ART = "The result is a real photograph, never a drawing, illustration, anime, cartoon, painting or 3D render.";

/** The prompt. `R` is the picked character's references (sent after the artwork), or null for no character. */
export function artToRealPrompt(R: RefSet | null, direction?: string): string {
  const extra = fence(direction ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const tail = [SKIN, PHOTO, REALISM_FIX.quality, ANATOMY, CLOTHES, SCENE, NOT_ART, extra && `Also: ${extra.replace(/\.?$/, ".")}`].filter(Boolean).join(" ");

  if (!R || !R.roles.length) {
    return [
      "Turn @image1 into a real photo of a real woman. She is a young, conventionally pretty adult woman, clearly over 21.",
      "Keep from @image1: the pose, framing and camera angle, the same teasing pose and expression, the outfit design and colours, the accessories and jewellery, the hairstyle, hair colour and eye colour, and her skin complexion exactly as in @image1.",
      `The same sexy, plump body proportions as @image1. ${PROPORTIONS_RULE.replace("in the references", "in @image1").replace("than in the references", "than in @image1")}`,
      "Realistic face proportions and a natural head size for a real woman: not the large head or oversized eyes of a drawing.",
      tail,
      "Basically: turn @image1 into a real, sexy woman with a natural head size.",
    ].join(" ");
  }

  const tags = R.roles.map((_, i) => "@image" + (i + 2));
  const ref = joinTags(tags);
  const roles = tags.map((t, i) => `${t} is ${R.roles[i]}`).join(", ");
  const an = R.anchors ? pickAnchors(R.anchors, "") : null;
  const body = an ? [an.upper, an.mid, an.legs].filter(Boolean).join("; ") : "";
  const avoid = an?.avoid?.length ? ` Not: ${an.avoid.map((x) => x.replace(/^not\s+/i, "")).join("; ")}.` : "";
  return [
    `Turn @image1 into a real photo of the woman from ${ref}. ${roles}${tags.length > 1 ? "; they all show the same woman" : ""}. She is an adult woman.`,
    `Take from ${ref}: her exact face, bone structure, eyes, brows, nose, lips, skin tone, freckles, moles and marks, and her hair colour and texture${an?.hair ? ` (${an.hair})` : ""}, styled like the hairstyle in @image1. Her body comes from ${ref}${body ? ` (${body})` : ""}. ${BODY_LOCK}${avoid}`,
    "Take from @image1: the pose, framing and camera angle, the same teasing pose and expression, the outfit design and colours, the accessories and jewellery, the setting and the mood.",
    outfitLock(ref, "", R.anchors?.sheetOutfit, "target").trim(),
    `Take only the person from ${ref}, never ${tags.length > 1 ? "their" : "its"} layout, panels, plain background, studio light or plain outfit. Realistic face proportions and a natural head size.`,
    tail,
    MODS_RULE,
  ].join(" ");
}
