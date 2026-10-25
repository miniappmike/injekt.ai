/**
 * The fixed prompts for the Reference Sheet maker. A sheet is one image of a character from many angles, which image
 * models then use as the strict identity reference. No AI call is needed to write them.
 */

/** The shape each sheet is made in: a square for the 3x3 face grid, a landscape for the face and body sheet. */
export const SHEET_ASPECT_RATIO = { face: "1:1", body: "3:2" } as const;

/** Body photos that can go into the face and body sheet (front, back or side). */
export const MAX_BODY_PHOTOS = 2;

/** Face sheet: one clear face photo (@image1) becomes a 3x3 grid of the same face from nine angles. */
export function faceSheetPrompt(): string {
  return (
    "Create a 3x3 character face sheet of the person in @image1: nine close-up head-and-shoulders portraits in three rows of three, " +
    "on a plain light grey studio background, with thin even gaps between the frames and no text, labels or borders. " +
    "Use @image1 as the strict identity reference: every frame must show exactly the same person, with the face shape, eyes, brows, nose, lips, jaw, " +
    "skin tone, freckles and marks, hairstyle and hair colour kept identical. " +
    "Change only the angle and expression. Row 1: front-facing and neutral, three-quarter view to the left, three-quarter view to the right. " +
    "Row 2: left profile, right profile, front-facing with a soft smile. " +
    "Row 3: chin slightly raised, chin slightly lowered, looking back over the shoulder. " +
    "Soft even studio lighting, the same in all nine frames, sharp focus. Do not add makeup, accessories or retouching."
  );
}

/**
 * Face and body sheet: the face sheet is @image1 and the body photos follow (@image2, and @image3 if there are two).
 * The result is one landscape sheet with the face from three angles above the body from the front, side and back.
 */
export function bodySheetPrompt(bodyPhotoCount: number): string {
  if (!Number.isInteger(bodyPhotoCount) || bodyPhotoCount < 1 || bodyPhotoCount > MAX_BODY_PHOTOS) {
    throw new Error(`A face and body sheet needs 1 to ${MAX_BODY_PHOTOS} body photos`);
  }
  const bodies = bodyPhotoCount === 1 ? "@image2" : "@image2 and @image3";
  return (
    `Create one landscape character reference sheet of the person shown in @image1 (a face sheet) and ${bodies} (${bodyPhotoCount === 1 ? "a body photo" : "body photos"}). ` +
    "Layout: a top row of three close-up portraits (front-facing, three-quarter view, profile) copied faithfully from @image1, " +
    "and below it a row of three full-body standing views of the same person, head to toe: front, side and back. " +
    "Plain light grey studio background, no text, labels or borders. " +
    "Use @image1 as the strict identity reference for the face, hair and skin. " +
    `Use ${bodies} as the strict reference for height proportions, build, body shape, skin tone and any marks or tattoos. ` +
    "Dress all three full-body views in the same simple, neutral, fitted clothing. " +
    "It must be the same person in every frame, in soft even studio lighting, with sharp focus."
  );
}
