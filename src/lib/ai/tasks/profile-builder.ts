import { PROFILE_FIELDS, type CharacterProfile, type ProfileKey } from "@/lib/characters";
import { extractJson } from "../json";
import { fence } from "../prompts/rules";
import type { TaskInput } from "../master-prompt";

export interface LabeledImage {
  /** What the image is, for example "face sheet". */
  label: string;
  dataUri: string;
}

/** The artifact's profile keys and the columns they are saved under here. */
const KEY_MAP: Record<string, ProfileKey> = {
  identity: "identity_line",
  face: "face",
  hair: "hair",
  skin: "skin",
  body: "body",
  traits: "distinctive_traits",
  accessories: "signature_accessories",
};

/** The roles the artifact gives each kind of image (sheets first, then photos). */
export const PROFILE_ROLES = {
  faceSheet: "her FACE reference sheet (a grid of her face from many angles)",
  bodySheet: "her BODY reference sheet (full-body views and portraits)",
  onlySheet: "her reference sheet (full-body views and face portraits)",
  photo: "a reference photo",
} as const;

export interface ProfileCharacter {
  always_keep?: string | null;
  height?: string | null;
  weight?: string | null;
}

/** Artifact A2 buildProfile, word for word. `images` are in order: face sheet, body sheet, then reference photos. */
export function buildProfileTask(d: ProfileCharacter, images: { role: string; dataUri: string }[]): TaskInput {
  const imgs = images;
  const n = imgs.length;
  const ns = imgs.filter((x) => x.role !== PROFILE_ROLES.photo).length;
  const notes = d.always_keep ?? "";
  const prompt = `You are writing a locked character profile for an AI image-generation workflow. The ${n} attached image${n > 1 ? "s show" : " shows"} the same character: ${imgs.map((x, i) => `image ${i + 1} is ${x.role}`).join("; ")}. Describe only what is visible. Do not name or guess who anyone is.

Merge all images into ONE consistent profile.${ns ? ` The reference sheet${ns > 1 ? "s are" : " is"} the source of truth: ${ns > 1 ? "take the face, eyes, brows, nose, lips, skin, freckles and hair from the face sheet, and the body, build and proportions from the body sheet" : "take the face, hair, skin and the body proportions from it"}; use the photos only to confirm details or fill in what the sheets do not show. Ignore the sheets' plain backgrounds, grid layout, studio light and plain outfits.` : " If images disagree, go with what appears most often."} Be specific and concrete so a different image model could reproduce the same face every time: eye colour and shape, brow shape, nose, lips, jaw and cheekbones, face shape, hair colour with highlights or roots, length, texture and parting, skin tone, exact placement of freckles, moles or tattoos, posture, and the body in concrete proportion terms (frame, shoulder width relative to hips, bust, waist definition, hip and glute fullness, thigh shape, leg length relative to torso, muscle tone), precise enough that a model reproduces the same figure every time. For body shape use mild, neutral, fashion-catalogue wording such as slim build, athletic build, petite frame, curvy figure, fuller bust, fuller hips, narrow waist or long legs, never explicit or anatomical sexual language. Always describe the character as an adult (young woman, woman, young man, man), never as a girl, boy, teen or child. List real jewellery or accessories that appear in more than one image or look permanent.
${notes ? `\nThe user says these must always be kept: <<<${fence(notes)}>>>\n` : ""}${d.height || d.weight ? `\nThe user gives these measurements for the character; keep the body and build description consistent with them, written in visual terms: ${[d.height && "height " + d.height, d.weight && "weight " + d.weight].filter(Boolean).join(", ")}\n` : ""}
DEFINITIVE WORDING, required for every trait: commit to ONE exact value per attribute and state it as fact. Never give ranges, alternatives or hedges: no "dark brown to near black", no "brown or hazel", no "X-ish", "-ish", "possibly", "appears", "seems", "likely", "somewhat", "slightly", "around", "roughly", "approximately", "between", "medium-to-", "or" between two options, and no slashes between choices. If a trait sits between two values, pick the closest single named value and write only that. Use precise, named descriptors: hair colour as one named shade (for example jet black, espresso brown, chestnut brown, honey blonde, platinum blonde, copper red); eye colour as one named shade (for example dark brown, amber, hazel green, steel blue); skin tone as one named tone plus one undertone (for example light olive with warm undertone, deep brown with neutral undertone); hair length tied to a body landmark (chin, shoulder, collarbone, mid-back, waist); face shape as one named shape (oval, round, heart, square, diamond, oblong); eye shape, brow shape, nose and lips each as one named type. Give marks an exact location (for example small mole above the right corner of the upper lip). Keep each field concise: short definitive phrases, no filler, no repetition across fields.

Write plain descriptive phrases. Do not use the words "photorealistic", "stunning", "beautiful", "detailed" or "highly detailed", and do not mention skin texture or pores.

Reply with only a JSON object with these string fields:
{"identity": "2 to 3 sentences, a compact paragraph combining face, hair and standout traits, written to open an image prompt", "face": "...", "hair": "...", "skin": "...", "body": "...", "traits": "the 3 to 5 most recognisable features, comma separated", "accessories": "..."}
If a field cannot be seen, write "not visible".`;
  return { prompt, images: imgs.map((x) => x.dataUri) };
}

/** Reads the model's JSON into our profile columns. Accepts our own key names too. */
export function parseProfileResponse(text: string): CharacterProfile {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    throw new Error(e instanceof Error && /could not be read/.test(e.message) ? "The model returned a profile that could not be read. Try again." : "The model did not return a profile. Try again.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The model returned an unexpected profile format. Try again.");
  const r = raw as Record<string, unknown>;
  const profile: CharacterProfile = {};
  for (const [from, to] of Object.entries(KEY_MAP)) {
    const v = typeof r[from] === "string" ? r[from] : r[to];
    if (typeof v === "string" && v.trim()) profile[to] = v.trim().slice(0, 2000);
  }
  if (!Object.keys(profile).length) throw new Error("The model returned an unexpected profile format. Try again.");
  return profile;
}

/** The artifact's labels for each profile field, used when the profile is written into a prompt. */
const BLOCK_LABELS: Record<ProfileKey, string> = {
  identity_line: "Identity line",
  face: "Face",
  hair: "Hair",
  skin: "Skin, freckles and marks",
  body: "Body and build",
  distinctive_traits: "Distinctive traits",
  signature_accessories: "Signature accessories",
};

/** Artifact A5 profileBlock: the locked profile as the text block later prompts carry. */
export function profileBlock(c: { profile: CharacterProfile; always_keep?: string | null; height?: string | null; weight?: string | null }): string {
  const p = c.profile || {};
  return (
    PROFILE_FIELDS.map(({ key }) => (p[key] ? `${BLOCK_LABELS[key]}: ${p[key]}` : ""))
      .filter(Boolean)
      .join("\n") +
    (c.always_keep ? `\nAlways keep: ${fence(c.always_keep)}` : "") +
    (c.height ? `\nHeight: ${c.height}` : "") +
    (c.weight ? `\nWeight: ${c.weight}` : "")
  );
}
