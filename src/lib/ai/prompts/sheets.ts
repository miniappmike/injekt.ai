/** Reference sheet prompts (artifact A13b shPrompts), word for word. */
import { fence } from "./rules";

const SH_FACE_PANELS='Panel order, left to right, top to bottom. Row 1: front view, neutral relaxed expression, mouth closed; front view, natural smile showing teeth; three-quarter view turned to her left, soft smile. Row 2: three-quarter view turned to her right, soft smile; left profile, neutral; right profile, neutral. Row 3: head tilted slightly down, eyes lowered, gentle smile; laughing with eyes crinkled, slight head tilt; back of the head showing the full hairstyle.';
const SH_GLUTE_SIZE: Record<string, string> = {smaller:'noticeably smaller glutes than in the body photos',ssmaller:'slightly smaller glutes than in the body photos',slarger:'slightly fuller, larger glutes than in the body photos',larger:'noticeably fuller, larger glutes than in the body photos',xlarger:'much fuller, larger glutes than in the body photos, still natural and in proportion to her frame'};
const SH_GLUTE_SHAPE: Record<string, string> = {round:'a round, full glute shape',heart:'a heart-shaped glute shape, fuller at the lower curve',lifted:'a lifted, toned, firm glute shape',athletic:'athletic, muscular glutes with visible muscle definition, like a regular gym-goer',soft:'a soft, natural glute shape with little muscle definition'};
const CUPS = ["A", "B", "C", "D", "DD", "E", "F"];

export interface SheetOptions {
  outfit?: "default" | "photo" | "custom";
  outfitText?: string;
  gluteSize?: string;
  gluteShape?: string;
  cup?: string;
}

/** Optional body fine-tuning, applied the same way in every view (artifact shTuneLine). */
export function tuneLine(o: SheetOptions): string {
  const parts: string[] = [];
  if (o.gluteSize && SH_GLUTE_SIZE[o.gluteSize]) parts.push(SH_GLUTE_SIZE[o.gluteSize]);
  if (o.gluteShape && SH_GLUTE_SHAPE[o.gluteShape]) parts.push(SH_GLUTE_SHAPE[o.gluteShape]);
  if (o.cup && CUPS.includes(o.cup)) parts.push(`a natural bust proportionate to a ${o.cup} cup`);
  return parts.length ? `Body adjustments, applied the same way in every view: ${parts.join('; ')}. Everything else about her body (height, waist, hips, legs, arms, shoulders, overall build and skin) stays exactly as in the body photos.` : '';
}

/**
 * The face sheet (one face photo as @image1) and the face + body turnaround (@image1 her face sheet or face photo,
 * @image2 and @image3 her body photos).
 */
export function sheetPrompts(hasSheet: boolean, two: boolean, o: SheetOptions = {}): { face: string; body: string } {
  const outfit = o.outfit === 'photo' ? 'the exact outfit she wears in @image2' : o.outfit === 'custom' && o.outfitText?.trim() ? fence(o.outfitText.trim()) : 'a plain fitted white athletic-fit crop top and matching plain white athletic-fit shorts, with bare feet';
  const tune = tuneLine(o);
  const ident = (ref: string) => `Identity must be identical in every panel: the same face shape, eyes and eye colour, brows, nose, lips, jaw, skin tone, freckles, moles and marks as ${ref}, and the exact same hairstyle, hair colour, parting and length. She is an adult woman.`;
  const keep = tune ? 'Apart from the listed body adjustments, do not beautify, slim, age or change her.' : 'Do not beautify, slim, age or change her.';
  const look = 'Flat, even, diffused front studio lighting with soft fill and no dramatic shadows, neutral white balance so skin tone and hair colour read accurately, sharp focus on the face. Real, unretouched skin with fine visible pores and natural tonal variation. SKIN REALISM, always: render her as a real photographed person, never as a render, doll or illustration. If any input image looks waxy, airbrushed, plastic, over-smoothed, CGI, cartoon or anime, ignore that surface finish completely and keep only her identity, features and true skin tone. Her skin shows natural texture: visible pores on the nose, cheeks and forehead, fine peach fuzz, faint natural redness around the nose and cheeks, slight unevenness in tone, and a few tiny imperfections such as small blemishes, faint freckles or fine lines where they fit her. Matte skin with only a little natural oil on the nose, no glossy, plastic, porcelain or blurred skin and no beauty filter. Hair has individual strands and a few flyaways. No text, labels, numbers, arrows, logos or watermarks anywhere.';
  const faceRef = hasSheet ? '@image1 (her face reference sheet)' : '@image1 (face reference)';
  const bodyRef = two ? '@image2 and @image3 (body references showing her from different angles, such as front and back or side)' : '@image2 (body reference)';
  return {
    face: `Create a clean character face reference sheet of the woman in @image1 (face reference). Layout: a 3 by 3 grid of 9 equal portrait panels separated by thin white gutters, on one plain seamless mid-light grey background. Every panel uses the same framing: a clean skincare beauty headshot from the top of the head to just below the collarbones, head filling most of the panel, camera at eye level. Bare neck and bare shoulders in every panel with no clothing, straps or necklines visible in frame, so her true skin complexion shows evenly across the face, neck, shoulders and collarbones: the same skin tone, undertone, freckles, moles and marks as @image1, with no tan lines and no colour shift between face and body. ${SH_FACE_PANELS} ${ident('@image1')} Do not beautify, slim, age or change her. ${look}`,
    body: `Create a clean character face and body turnaround reference sheet of the woman in ${faceRef}, with her body taken from ${bodyRef}. Wide 16:9 layout on one plain seamless mid-grey studio background. Left two thirds: four full-body views side by side, all at exactly the same scale and standing on the same floor line, head to feet fully visible with a little space above and below: front view, three-quarter view turned to her left, left side profile, and back view. Pose in all four: standing straight and relaxed, arms slightly away from the body, feet hip-width apart, neutral friendly expression. Body adherence is strict: match her exact body shape, build, shoulder width, bust, waist, hips, glutes, thighs, leg length, muscle tone, proportions and height ${two ? 'from both body references' : 'exactly as in @image2'}, shown in a neutral, non-sexual, fashion-catalogue way.${tune ? ' ' + tune : ''} Outfit in all four views: ${outfit}. Right third: a 2 by 2 grid of large beauty-headshot portraits from the top of the head to just below the collarbones, separated by thin white gutters, same background and lighting, with bare neck and bare shoulders and no clothing, straps or necklines visible in these four portraits, so her skin complexion reads evenly from face to shoulders with no colour shift: front neutral; front natural smile with teeth; three-quarter view to her left; left profile. ${ident('@image1')} ${keep} ${look}`,
  };
}
