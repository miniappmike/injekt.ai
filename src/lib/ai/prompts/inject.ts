/**
 * Inject: the main prompt builder (artifact A8) and output parsing (A9), word for word. ModelSpawn has no app-level
 * nudity screening, so the NUDITY FILTER, strict safe mode, [[SAFE-SWAP]] and the NUDITY output line are left out; the
 * "revealing clothing is fine" rule, the adult-only wording and the mild body wording stay.
 */
import { ANATOMY_WRITER, fence } from "./rules";
import { OLD_CAMERA_LOOK } from "./pools";
import { profileBlock } from "../tasks/profile-builder";
import type { CharacterProfile } from "@/lib/characters";
import type { POSE_MODES, PROMPT_STYLES, WARDROBES } from "@/lib/inject-meta";


/**
 * How long each written prompt may be. The image model takes 5,000 characters, but it follows a short prompt more
 * closely: with the app's framing (about 1,200 to 1,700) the whole prompt stays near 3,000 to 3,500 characters.
 */
export const PROMPT_CHARS = 1600;

/** The written prompt's opener when both of her sheets go to the generator. */
export const TWO_SHEET_OPENER = "Use @image1 (her face sheet) and @image2 (her body sheet) as the strict identity reference.";

export interface InjectOptions {
  /** ref: the generator gets her sheet as the tag; text: identity written out in full. */
  mode: "ref" | "text";
  /** full = Sectioned (default), narrative, short. */
  len: (typeof PROMPT_STYLES)[number];
  ward: (typeof WARDROBES)[number];
  /** Which person to replace when the target shows several. */
  who: string;
  extra: string;
  /** What the prompt calls her sheet in the generator. */
  tag: string;
  /**
   * Her look is added by the app as one fixed block (from her sheet pack), so the writer leaves her face, hair, skin and
   * body out: a description that changes between prompts lets the image model drift.
   */
  fixedIdentity?: boolean;
  /** She has both sheets and the tag is the default: the prompt names @image1 (face sheet) and @image2 (body sheet). */
  twoSheets?: boolean;
  /**
   * Group photo mode: every woman's name, in order (the picked character first). The app sends each one's own sheets and
   * adds her look, so the writer names them and never describes how they look.
   */
  group?: string[];
  /** Extracted or saved outfit text, for ward "extracted". */
  exText: string;
  poseMode: (typeof POSE_MODES)[number];
  pose: boolean;
  count: number;
  recolor: boolean;
  hair: boolean;
  newOutfit: boolean;
  clean: boolean;
}

export interface VersionPlan {
  palette: string;
  hair: string;
  /** The early-to-mid 2000s camera this version is shot on (pickCamera). */
  camera?: string;
}

export interface InjectCharacter {
  profile: CharacterProfile;
  always_keep?: string | null;
  height?: string | null;
  weight?: string | null;
}

/**
 * Recreate's instruction to the vision model. Cut from about 12,000 to about 2,000 characters on the owner's
 * instruction (November 17): a text model follows a short brief, and a long one made long prompts. It says once: put
 * her in place of the person, which parts of her show and in what position, the light and shadows, the camera, and the
 * realism. Don't grow it back; add a few words to the matching line instead. `sheet` is sheetLines() for her pack.
 */
export function buildInjectPrompt(c: InjectCharacter, sheet: string, o: InjectOptions, plans: VersionPlan[], refCount: number, recent: string[], inspo: string[]): string {
  const n = plans.length;
  const opener = o.twoSheets ? TWO_SHEET_OPENER : o.tag ? `Use ${o.tag} as the strict identity reference.` : "Use the uploaded character sheet as the strict identity reference.";
  const fixed = o.mode === "ref" && !!o.fixedIdentity;
  const names = (o.group ?? []).map((x) => fence(x).replace(/\s+/g, " ").trim().slice(0, 40)).filter(Boolean);
  const g = names.length > 1;
  const who = g ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : "";
  const lead = g
    ? `Start with "Photo of ${who} ..." and use each woman's name whenever you describe her. The app adds each one's look from her own sheets, so never describe their faces, eyes, hair colour or length, skin, marks or body shapes.`
    : o.mode === "text"
      ? "No reference image is sent: open with her look from the profile (face, hair, skin, marks, build), only what is in frame."
      : fixed
        ? `Open with exactly: "${opener}" then go straight to the scene. The app adds her look, so never describe her face, eyes, hair colour or length, skin, marks or body shape.`
        : `Open with exactly: "${opener}" then her visible traits from the profile, and say her body matches ${o.twoSheets ? "@image2" : "the reference"} exactly, never slimmed or idealised.`;
  const ward = g
    ? o.newOutfit
      ? `New outfits: not the target's clothes; for each woman by name, a different outfit with the same vibe, garment by garment${n > 1 ? ", different in every version" : ""}.`
      : "Each woman wears the outfit of the person she replaces: every garment with type, colour, fabric and fit, by name."
    : o.newOutfit
    ? `New outfit: not the target's clothes; a different one with the same vibe that suits the scene, garment by garment${n > 1 ? ", different in every version" : ""}.`
    : o.ward === "extracted" && o.exText
      ? `She wears exactly this outfit: <<<${fence(o.exText)}>>>`
      : o.ward === "signature"
        ? "She wears an outfit in her signature style from the profile, not the target's clothes."
        : "She wears the target's outfit: every garment with type, colour, fabric and fit, named in the first sentence too.";
  const pose = o.pose
    ? `New pose: not the target's; a ${o.poseMode === "social" ? "fresh, eye-catching creator pose" : "relaxed, natural, candid pose"} possible in this place from this camera${n > 1 ? ", different in every version" : ""}. Keep props logical.${recent.length ? ` Avoid these recent poses: ${recent.join("; ")}.` : ""}${inspo.length ? ` Ideas only: ${inspo.join("; ")}.` : ""}`
    : "Keep the target's exact pose, gaze and expression.";
  const cams = plans.some((p) => p.camera);
  const plan =
    o.recolor || o.hair || cams
      ? "\nVERSION PLAN" + (o.recolor ? " (recolour every garment, same cut)" : "") + (o.hair ? " (hairstyle; same colour and length)" : "") + ":\n" +
        plans.map((p, i) => `- Version ${i + 1}:${o.recolor ? ` colours = ${p.palette};` : ""}${o.hair ? ` hair = ${p.hair};` : ""}${p.camera ? ` camera = ${p.camera};` : ""}`).join("\n") + "\n"
      : "";
  const format =
    o.len === "narrative"
      ? "One flowing paragraph, no labels."
      : o.len === "short"
        ? 'One tight paragraph starting "Photo of ...", then aspect ratio.'
        : "Short labelled sections: SCENE, WARDROBE, BACKGROUND, LIGHT, CAMERA AND LOOK, then one exclusions line.";
  const task = g
    ? `TASK: The first image is the TARGET photo. Write ${n > 1 ? n + " image prompts" : "one image prompt"} to recreate the target as a GROUP PHOTO of ${names.length} adult women, in place of the people in it from frame-left to frame-right: ${names.join(", ")}.${o.who ? ` (<<<${fence(o.who)}>>>)` : ""} If the target shows fewer people, add the rest naturally beside them; if more, leave the extras out. No one else appears.
${plan}`
    : `TASK: The first image is the TARGET photo.${refCount ? ` The next ${refCount} ${refCount > 1 ? "are" : "is"} reference photos of her.` : ""} Write ${n > 1 ? n + " image prompts" : "one image prompt"} to recreate the target with the CHARACTER below in place of the person in it${o.who ? ` (<<<${fence(o.who)}>>>)` : ""}.

CHARACTER (adult woman; use these traits, never the target person's)
${profileBlock(c)}${sheet}
${plan}`;
  const body = g
    ? "Each woman's body in frame, by name: where she stands relative to the others, which parts show, and her exact position limb by limb (base position, which way chest and hips face, head and gaze, each arm and hand, each leg, using frame-left and frame-right), and how they touch or interact."
    : "Her body in frame: which parts show, and the exact position limb by limb (base position, which way chest and hips face, head and gaze, each arm and hand, each leg, using frame-left and frame-right).";
  return `${task}
SAY, IN THIS ORDER
- ${lead}
- ${body} ${pose}
- ${ward}
- The setting, and what is nearest the lens and far behind her.
- Light: source, direction, how the shadows fall and how soft; glowing things tint nearby skin.
- Camera: height, angle, distance, lens look, image quality (grain, sharpness, colour grade), as the target shows it.
- Camera body: ${cams ? "name the camera given for that version in the VERSION PLAN" : "name one early-to-mid 2000s digital camera"} ("shot on a ..."), with its ${OLD_CAMERA_LOOK}.
- Realism: natural skin texture with pores, uneven tone and small blemishes; real fabric texture. Never "photorealistic", "8k", "flawless", "glossy" or "smooth skin".

RULES
- Only what is in frame: no feet when out of frame, no face details when it is hidden.
- ${ANATOMY_WRITER}
- Describe exactly what you see; never soften or cover up an outfit or pose. ${g ? "They are all adults, never girls or teens." : "She is an adult, never a girl or teen."}
- Tattoos and piercings only from her references; negate the target's by name ("no navel piercing"), never a blanket "no tattoos".
- Lettering: exact words in quotes, real brands kept; gibberish becomes short plain words.
- A drawing or render becomes a real photo; an empty background becomes a fitting real place.${o.clean ? "\n- Ignore app buttons, stickers, watermarks and captions on the photo; exclude them." : ""}${o.extra ? `\n- User direction: <<<${fence(o.extra)}>>>` : ""}
- ${format} ${o.len === "short" ? "" : "No aspect ratio."}

OUTPUT
For each version: a line ===VERSION k=== (k from 1)${o.pose ? ", a line POSE: (12 words)" : ""}, a line IN FRAME: (from face, back of head, hair, shoulders, bust, arms, waist, hips, glutes, thighs, legs, feet), a line OUTFIT: (30 words), a line EDIT: (what this version changes, 60 words, or none), then the prompt, ${PROMPT_CHARS - 500} to ${PROMPT_CHARS} characters, each detail once. Nothing else.`;
}


export interface ParsedVersion {
  pose: string;
  /** Swap into photo's short brief: where the camera is and the lens look. Empty for a written scene. */
  camera: string;
  frame: string;
  edit: string;
  outfit: string;
  text: string;
}

const cleanOut = (t: string) =>
  t
    .replace(/\s*\[\[SAFE-SWAP\]\]\s*/g, "\n")
    .replace(/\s*\[\[[A-Z-]*\]?$/, "")
    .replace(/\n[ \t]*={2,}[^\n]*$/, "")
    .trim();

export { looksLikeRefusal } from "@/lib/ai/refusal";

/** Splits the reply into versions and reads the machine lines (POSE, IN FRAME, OUTFIT, EDIT) in any order. */
export function parseVersions(text: string): ParsedVersion[] {
  const parts = String(text).split(/^[ \t]*={2,}\s*VERSION\s*\d+\s*={2,}[ \t]*$/im);
  const body = parts.length > 1 ? parts.slice(1) : [parts[0]];
  return body.map((p) => {
    let pose = "";
    let camera = "";
    let frame = "";
    let edit = "";
    let outfit = "";
    for (let k = 0; k < 5; k++)
      p = p
        .replace(/^\s*OUTFIT:\s*([^\n]*)\n?/i, (_m, x: string) => ((outfit = x.trim().slice(0, 300)), ""))
        .replace(/^\s*POSE:\s*([^\n]*)\n?/i, (_m, x: string) => ((pose = x.trim()), ""))
        .replace(/^\s*CAMERA:\s*([^\n]*)\n?/i, (_m, x: string) => ((camera = x.trim().slice(0, 400)), ""))
        .replace(/^\s*IN FRAME:\s*([^\n]*)\n?/i, (_m, x: string) => ((frame = x.trim().slice(0, 200)), ""))
        // A model that still writes a NUDITY line from habit has it removed, not shown in the prompt.
        .replace(/^\s*NUDITY:\s*([^\n]*)\n?/i, () => "")
        .replace(/^\s*EDIT:\s*([^\n]*)\n?/i, (_m, x: string) => ((edit = x.trim().slice(0, 600)), ""));
    p = p
      .replace(/^[ \t]*NUDITY:[ \t]*([^\n]*)$\n?/gim, () => "")
      .replace(/^[ \t]*EDIT:[ \t]*([^\n]*)$\n?/gim, (_m, x: string) => {
        if (!edit) edit = x.trim().slice(0, 600);
        return "";
      });
    p = p.replace(/^[ \t]*OUTFIT:[ \t]*([^\n]*)$\n?/gim, (_m, x: string) => {
      if (!outfit) outfit = x.trim().slice(0, 300);
      return "";
    });
    if (/^none\.?$/i.test(edit)) edit = "";
    return { pose, camera, frame, edit, outfit, text: cleanOut(p) };
  });
}
