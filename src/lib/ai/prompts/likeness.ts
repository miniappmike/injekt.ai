/**
 * The likeness system from the artifact (A10, A17, A18, A19), word for word: the full report, the quick score that runs
 * on generated images, the likeness fix (repaint the person) and the face fix (repaint only the face).
 */
import { asksMakeup, BODY_LOCK, fence, joinTags, makeupRule, MODS_RULE, REALISM_FIX, TEXT_SHORT } from "./rules";
import { pickAnchors, type Anchors, type ModelFamily } from "./identity";

/**
 * Makeup is a styling choice, like the outfit, so the checkers judge the features under it. Not in the artifact: added
 * because lipstick and eyeshadow were being scored as lip and eye drift, and "fixed" back to a bare face.
 */
export const MAKEUP_SCORE_RULE =
  "MAKEUP IS NOT IDENTITY: she may wear makeup on purpose, so ignore it like the outfit. Judge the features underneath: eye shape and iris colour, lip shape and fullness, brow shape, face shape and skin undertone. Never mark a trait down for lipstick or lip colour, eyeshadow, eyeliner, lashes, brow tint, blush, bronzer, contour, highlighter, foundation or powder, and never write a fix about makeup or lip colour. Freckles or marks covered by foundation count as hidden, not missing.";

/**
 * Fine details can't be judged on a small or distant face. Not in the artifact: added because iris colour was being
 * marked down in full-body shots where the eyes are a few pixels across.
 */
export const DISTANCE_SCORE_RULE =
  "SMALL OR DISTANT FACES: when the face in the generated image is small (a full-body or wide shot), soft, in shadow or low-resolution, fine details cannot be judged. Then do not score or mention iris colour, freckles, small moles, fine skin texture or small face piercings; score eyes on shape and spacing only, and the face on its overall shape and proportions, and give the benefit of the doubt. Only mark a fine detail down when it is clearly visible and clearly different, and never write a fix about a detail you could not see clearly.";

/** A fix that is really about makeup (lip colour, eyeshadow...), which the prompts tell the checker not to write. */
const makeupFix = (f: string) => asksMakeup(f) || /\blip(s)?\b[^;,.]*\b(colou?r|pink|red|nude|burgundy|berry|plum|dark|glossy|matte)\b|\b(pink|red|nude|burgundy|berry|plum|natural)\b[^;,.]*\blips?\b/i.test(f);

// ---------- A10: full report ----------

export function likenessReportPrompt(o: { profile: string; refCount: number; isSheet: boolean; used: string }): string {
  const { refCount, used } = o;
  return `You are a strict likeness checker for an AI character workflow. The first ${refCount} attached image${refCount > 1 ? "s are" : " is"} the REFERENCE for the character${o.isSheet ? " (a character reference sheet)" : ""}. The LAST attached image is a newly GENERATED image that is meant to show the same character.

CHARACTER PROFILE (ground truth):
${o.profile}

Compare the face and identity of the person in the generated image with the reference. Ignore differences in pose, outfit, setting, lighting, camera and expression unless they hide a trait. Do not name or identify anyone.
${MAKEUP_SCORE_RULE}
${DISTANCE_SCORE_RULE}

Score each of these traits from 0 to 10, where 10 means indistinguishable from the reference, and skip any trait that cannot be seen in the generated image: Face shape, Eyes (colour and shape), Brows, Nose, Lips, Jaw and cheekbones, Skin tone, Freckles moles and marks, Hair colour, Hair texture length and hairline, Build, Body proportions (shoulders, bust, waist, hips, glutes, legs), Signature accessories.
Give an overall likeness score from 0 to 100 for whether a viewer would see the same person, weighting eyes, nose, face shape and marks most, and body proportions heavily whenever the body is visible. Be honest; do not inflate.
For every trait under 9, write "fix": a short, concrete, positive phrase that describes the reference version of that trait (for example "deep hazel almond-shaped eyes with a slight upturn at the outer corners").
Write "edit_prompt": 2 to 4 sentences for an image-editing model that has the generated image and the reference sheet loaded: keep the pose, outfit, setting, light, framing and expression exactly, and change only the drifted face and hair traits to match the reference, naming each fix.
${
  used
    ? `The user made the image with this prompt:
<<<${fence(used.slice(0, 6000))}>>>
Write "revised_prompt": the same prompt with everything else kept, but with the identity strengthened. Put the corrected traits as clear anchors near the start, repeat the three most drifted traits briefly near the end, and remove any wording that may have caused the drift. Keep its style and length.`
    : 'Set "revised_prompt" to an empty string.'
}
Use mild, neutral wording for body shape and always describe the character as an adult.

Reply with only a JSON object:
{"overall": number, "verdict": "one sentence", "traits": [{"trait": "Eyes", "score": number, "reference": "short description", "generated": "short description", "fix": "phrase or empty"}], "edit_prompt": "...", "revised_prompt": "..."}`;
}

export interface LikenessReport {
  overall: number;
  verdict: string;
  traits: { name: string; score: number; reference: string; generated: string; fix: string }[];
  editPrompt: string;
  revisedPrompt: string;
}

const str = (v: unknown, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : typeof v === "number" ? String(v) : "");
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(Math.round(n), lo), hi);

export function parseLikenessReport(raw: unknown): LikenessReport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The model returned a report in an unexpected format. Try again.");
  const r = raw as Record<string, unknown>;
  const overall = Number(r.overall);
  if (!Number.isFinite(overall)) throw new Error("The model returned a report without a score. Try again.");
  const traits = (Array.isArray(r.traits) ? r.traits : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({ name: str(t.trait ?? t.name, 60), score: Number(t.score), reference: str(t.reference, 300), generated: str(t.generated, 300), fix: str(t.fix, 200) }))
    .filter((t) => t.name && Number.isFinite(t.score))
    .map((t) => ({ ...t, score: clamp(t.score, 0, 10), fix: makeupFix(t.fix) ? "" : t.fix }))
    .slice(0, 16);
  return { overall: clamp(overall, 0, 100), verdict: str(r.verdict, 400), traits, editPrompt: str(r.edit_prompt, 3000), revisedPrompt: str(r.revised_prompt, 12000) };
}

/** Plain text of a report, for the History list. */
export function likenessReportText(r: LikenessReport): string {
  const fixes = r.traits.filter((t) => t.fix);
  return [
    `Overall: ${r.overall}/100`,
    r.verdict,
    fixes.length ? `Fixes:\n${fixes.map((t) => `- ${t.name}: ${t.fix}`).join("\n")}` : "",
    r.editPrompt ? `Edit prompt:\n${r.editPrompt}` : "",
    r.revisedPrompt ? `Revised prompt:\n${r.revisedPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------- A17: quick score ----------

export function quickLikenessPrompt(roles: string[], cmp: boolean): string {
  const n = roles.length;
  return `The first ${n} attached image${n > 1 ? "s show" : " shows"} one adult woman, the identity reference: ${roles.map((role, i) => `image ${i + 1} is ${role}`).join("; ")}. ${cmp ? "The SECOND-TO-LAST image is the ORIGINAL photo before a likeness fix. " : ""}The LAST image is a newly generated photo that should show the same woman${cmp ? " (the fixed version of the original)" : ""}. Compare identity only. Ignore pose, outfit, setting, light, camera and expression. Do not name or identify anyone. ${MAKEUP_SCORE_RULE}
${DISTANCE_SCORE_RULE}
First list the concrete differences you can see between the reference and the generated woman (face shape, eyes, nose, mouth, hair colour, hair cut and length, skin tone and freckles, tattoos and piercings, and the body shape and proportions that are visible: shoulders, bust, waist, hips, glutes, thighs). Then score each trait on its own from 0 to 10 with this scale: 10 indistinguishable, 8 clearly the same person with small differences, 6 the same type but noticeably different, 4 or less a different person. Use the full scale and score each trait independently; do not give the same number to everything.
ONLY SCORE WHAT YOU CAN SEE in the generated image. If a trait is mostly hidden (for example the face or eyes behind a phone, hands, hair or sunglasses, a back view, hips and glutes hidden by a seated pose, a table or loose clothing, legs out of frame), set it to null instead of guessing or marking it down. If a trait is only partly visible, score just the visible part and do not penalise what is hidden. Never lower a score because something cannot be seen. ${DISTANCE_SCORE_RULE}
${cmp ? `Score the LAST image. Then compare it directly with the ORIGINAL against the reference and set "verdict" to "better" if the fixed image is clearly closer to the reference woman, "worse" if the original was clearly closer, or "same" if the difference is small, with "verdict_reason" as one short sentence naming what changed.\n` : ""}Reply with only JSON: {${cmp ? '"verdict": "better", "verdict_reason": "...", ' : ""}"differences": ["..."], "face_shape": 0 or null, "eyes": 0 or null, "nose_mouth": 0 or null, "hair_colour": 0 or null, "hair_cut": 0 or null, "skin": 0 or null, "upper_body": 0 or null (shoulders, bust, arms), "lower_body": 0 or null (waist, hips, glutes, thighs, legs), "hidden": ["short names of the traits you set to null"], "fixes": ["one short concrete phrase per drifted trait that describes the REFERENCE version, for example deep burgundy wine-red hair rather than bright red, wide curvy hips and full rounded glutes with a narrow waist, or no navel piercing"]}`;
}

export interface QuickScores {
  face: number | null;
  hair: number | null;
  skin: number | null;
  upper: number | null;
  lower: number | null;
  body: number | null;
}

export interface QuickLikeness {
  /** 0-100, or null when nothing could be scored. */
  score: number | null;
  sc: QuickScores;
  fixes: string[];
  diffs: string[];
  hidden: string[];
  verdict: "better" | "same" | "worse" | null;
  why: string;
}

/** Artifact quickLike scoring: face .45, hair .20, skin .10, upper body .10, lower body .15, over what was visible. */
export function parseQuickLikeness(r: unknown, cmp: boolean): QuickLikeness {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(10, Number(v))));
  const avg = (a: (number | null)[]) => {
    const x = a.filter((v): v is number => v != null);
    return x.length ? x.reduce((p, q) => p + q, 0) / x.length : null;
  };
  const sc: QuickScores = {
    face: avg([num(o.face_shape), num(o.eyes), num(o.nose_mouth)]),
    hair: avg([num(o.hair_colour), num(o.hair_cut)]),
    skin: num(o.skin),
    upper: num(o.upper_body),
    lower: num(o.lower_body),
    body: null,
  };
  sc.body = avg([sc.upper, sc.lower]);
  const w = { face: 0.45, hair: 0.2, skin: 0.1, upper: 0.1, lower: 0.15 } as const;
  let tot = 0;
  let wt = 0;
  for (const k of Object.keys(w) as (keyof typeof w)[]) {
    const v = sc[k];
    if (v != null) {
      tot += v * w[k];
      wt += w[k];
    }
  }
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const fixes = strings(o.fixes).filter((x) => x.trim() && !makeupFix(x)).map((x) => x.trim().slice(0, 160)).slice(0, 6);
  const diffs = strings(o.differences).map((x) => x.slice(0, 160)).slice(0, 8);
  const hidden = strings(o.hidden).filter((x) => x.trim()).map((x) => x.trim().replace(/_/g, " ").slice(0, 30)).slice(0, 6);
  const verdict = cmp && (["better", "same", "worse"] as const).includes(o.verdict as never) ? (o.verdict as QuickLikeness["verdict"]) : null;
  return { score: wt ? Math.round((tot / wt) * 10) : null, sc, fixes, diffs, hidden, verdict, why: verdict && typeof o.verdict_reason === "string" ? o.verdict_reason.slice(0, 200) : "" };
}

// ---------- A18: likeness fix ----------

/** References for a fix, in @image2... order: roles, kinds (pack crops only) and the pack's anchors. */
export interface FixRefs {
  roles: string[];
  kinds: string[];
  anchors: Anchors | null;
  usePack: boolean;
}

const bodyRefTags = (kinds: string[], tags: string[]) => joinTags(kinds.map((k, i) => (k === "body" || k === "side" ? tags[i] : null)).filter((x): x is string => !!x));

/** Repaints the person in @image1 from her references (artifact fixParts). */
export function likenessFixPrompt(R: FixRefs, fixes: string[], frame: string | undefined, family: ModelFamily): string {
  const tags = R.roles.map((_, i) => "@image" + (i + 2));
  const an = pickAnchors(R.usePack ? R.anchors : null, frame);
  const body = [an.upper, an.mid, an.legs].filter(Boolean).join("; ");
  const bodyRef = (R.usePack && bodyRefTags(R.kinds, tags)) || joinTags(tags);
  const avoid = (an.avoid || []).map((x) => x.replace(/^not\s+/i, ""));
  const words = [an.hair && `hair: ${an.hair}`, an.face && `face: ${an.face}`, an.skin && `skin: ${an.skin}`, body && `body: ${body}`].filter(Boolean).join(". ");
  const first = family === "pro" && words ? `IDENTITY (follow exactly): ${words}.${avoid.length ? ` Not: ${avoid.join("; ")}.` : ""}\n\n` : "";
  const sheetOutfit = R.usePack && R.anchors?.sheetOutfit;
  return `${first}Replace the woman in @image1 with the woman from ${joinTags(tags)}. ${tags.map((t, i) => `${t} is ${R.roles[i]}`).join(", ")}${tags.length > 1 ? "; they all show the same woman" : ""}. Repaint the person completely from the reference: her face, hair, skin and body must be the reference woman's, not the woman currently in @image1. ${fixes && fixes.length ? `In particular: ${fixes.join("; ")}.` : ""}${an.face ? ` Face: ${an.face}.` : ""}${an.hair ? ` Hair: ${an.hair}.` : ""}${an.skin ? ` Skin: ${an.skin}.` : ""}${body ? ` Her body must match ${bodyRef} exactly: ${body}; her clothes stay the same garments but fit her real shape.` : ""}${avoid.length ? ` Not: ${avoid.join("; ")}.` : ""} Keep everything else from @image1: the pose, expression, outfit, props, background, light, framing and camera look. ${BODY_LOCK} Take only the person from ${joinTags(tags)}, never their layout, panels, backgrounds or outfit.${sheetOutfit ? ` Never dress her in the reference outfit (${sheetOutfit}).` : ""} ${MODS_RULE} ${makeupRule("@image1")} ${REALISM_FIX.quality} ${TEXT_SHORT}`;
}

// ---------- A19: face fix ----------

export function faceFixPrompt(R: { roles: string[]; anchors: Anchors | null }, o: { hair?: boolean; note?: string } = {}): string {
  const tags = R.roles.map((_, i) => "@image" + (i + 2));
  const ref = joinTags(tags);
  const roles = tags.map((t, i) => `${t} is ${R.roles[i]}`).join(", ");
  const an = pickAnchors(R.anchors, o.hair ? "face, hair" : "face");
  const avoid = (an.avoid || [])
    .filter((x) => !/slim|thin|hip|glute|waist|curv|figure|body|bust|chest|leg|thigh|athletic|skinny|narrow|build/i.test(x) && (o.hair || !/hair/i.test(x)))
    .map((x) => x.replace(/^not\s+/i, ""));
  const hairLine = o.hair
    ? `Also match her hair colour and hairline${an.hair ? ` (${an.hair})` : ""}, but keep the hairstyle, length, parting and how the hair falls exactly as in @image1.`
    : "Keep the hair exactly as in @image1: the same style, colour, length, parting, flyaways and how it falls around the face.";
  return `FACE-ONLY EDIT of @image1. ${roles}${tags.length > 1 ? "; they all show the same woman" : ""}. Replace only the face of the woman in @image1 with her face from ${ref}, so she is unmistakably the reference woman. Copy her exact facial identity: face shape, bone structure, forehead, cheekbones, jaw and chin, eye shape, eye colour, eye spacing, eyelids and lashes, brows, nose, lips and mouth shape, ears if visible, facial skin tone and undertone, and only the freckles, moles, marks and face piercings she has${an.face ? `. Her face: ${an.face}` : ""}${an.skin ? `. Her skin: ${an.skin}` : ""}.${avoid.length ? ` Not: ${avoid.join("; ")}.` : ""} ${hairLine}
Keep the face's pose from @image1: the same head position, tilt and turn, gaze direction and expression (the same smile or mouth position, eye openness and brow movement), rebuilt with her features. Match @image1's light on the new face: the same light direction, shadows, highlights, colour temperature, colour grade, sharpness, focus, grain and noise, and blend the face seamlessly into the neck, ears and hairline with no visible edge, halo, seam or colour shift. If part of her face is hidden or out of frame in @image1, change only what is visible and add nothing that is not in frame.
Change nothing else: her body and its proportions, the skin on her body, the outfit, accessories, hands, pose, props, background, framing, crop and camera angle stay exactly as in @image1. Take only her face from ${ref}, never its grid, panels, background, studio light, hairstyle or clothing.
It must look like a real, unedited photo: matte, textured facial skin with visible pores, fine peach fuzz, slightly uneven tone and small natural imperfections; no smoothing, beauty filter, glow, waxy, plastic, doll or CGI look. Keep the makeup from @image1 exactly, rebuilt on her features: the same eyeshadow colours and placement, eyeliner shape, lashes, brow styling, blush, contour, highlighter and lip colour and finish; do not remove, lighten or add makeup${o.note && asksMakeup(o.note) ? " except as the note below asks" : ""}. Do not add tattoos or piercings she does not have.${o.note ? ` Note: ${fence(o.note).slice(0, 160)}` : ""}`;
}
