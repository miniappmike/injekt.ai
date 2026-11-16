/**
 * The original, full wording of the shared rules, exactly as it was before the November 2026 shortening (see ./rules.ts).
 * Art to Real and the reference sheet prompts were left out of that shortening on purpose and still use these, so their
 * prompts read word for word as before. Do not edit these to match ./rules.ts.
 */

export const SKIN_ART_RULE =
  "TATTOOS STAY ON SKIN: her tattoos and marks are part of her skin, not a print or design. Show each one only where that exact patch of bare skin is visible. Where clothing covers it (a bodysuit, catsuit, swimsuit, top, trousers, tights or any other fabric), it is hidden under the fabric: never print, draw, embroider, appliqué or show it on the outside of any garment, and never turn it into a graphic, patch or logo on her clothes. Fabric over a tattoo stays exactly as the garment is, with no added motif.";

export const MODS_RULE =
  "BODY MODIFICATIONS: her tattoos, piercings (including belly-button, nose, septum, lip, eyebrow and extra ear piercings), scars, birthmarks and moles come only from her reference and profile. Do not add any that she does not have, and never copy them from another person or the source scene. " +
  SKIN_ART_RULE;

export const REALISM_FIX = {
  skin: "Real, unretouched matte skin with visible pores, fine peach fuzz, uneven tone, faint redness and small natural imperfections, with a few flyaway hairs.",
  texture: "Fabrics and surfaces show their real texture, with visible weave and creases in the clothing and natural wear on the surroundings.",
  camera: "It has a smartphone main-camera look with slight softness and focus falloff, visible noise in the shadows, mild compression and true-to-life colour.",
  quality:
    "IMAGE QUALITY: a real, unedited smartphone photo, not a render: slight softness and focus falloff, faint motion blur in moving hands or hair, sensor noise in the shadows, mild JPEG compression, imperfect auto white balance. LIGHT AND SHADOW: shadows follow the scene's visible light sources in one direction and softness, with soft contact shadows under feet, hands and props and warm light spilling from glowing objects onto nearby skin; with camera flash, a tight shadow sits just behind her. Skin is matte and textured: visible pores, fine peach fuzz, uneven tone, faint redness, small imperfections. No smoothing, no glossy, waxy, plastic or porcelain skin, no glow, no beauty filter, no CGI, doll or 3D-render look.",
};

export const PROPORTIONS_RULE =
  "EXAGGERATED PROPORTIONS STAY: if her figure in the references is extreme or exaggerated (for example a very large bust, a very small waist, very wide hips, very large glutes or very thick thighs), reproduce it at the same scale and ratios. Never shrink, tone down, average or normalise it toward a typical body, and never make it more modest than in the references.";

export const BODY_LOCK =
  "BODY LOCK (strict): her body must match the reference exactly: the same height impression, frame, shoulder width, bust, waist, hips, glutes, thighs, leg length, arm thickness and muscle tone, and the same overall proportions. Do not slim, enlarge, lengthen, tone or idealise her figure, and do not adapt it to the pose, outfit or the original person's body. " +
  PROPORTIONS_RULE;

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
  return ` OUTFIT LOCK: use ${refs} for her face, hair and body shape only and ignore the clothing shown there. ${wear}${so ? ` Never dress her in the reference outfit (${so}).` : ""}`;
}

