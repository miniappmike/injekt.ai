import { z } from "zod";
import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import type { TaskInput } from "../master-prompt";

export interface LabeledImage {
  /** What the image is, for example "face sheet". */
  label: string;
  dataUri: string;
}

export function buildProfileTask(
  character: { name: string; height?: string | null; weight?: string | null; always_keep?: string | null },
  images: LabeledImage[],
): TaskInput {
  const list = images.map((img, i) => `@image${i + 1}: ${img.label}`).join("\n");
  const known = [
    `Name: ${character.name}`,
    character.height && `Height: ${character.height}`,
    character.weight && `Weight: ${character.weight}`,
    character.always_keep && `Always keep: ${character.always_keep}`,
  ].filter(Boolean);

  return {
    instructions: `Task: build a character profile from the reference images.

Describe only what is visible in the images. If a trait cannot be seen, use an empty string for it.
Do not guess at age, ethnicity, personality or backstory.

Return ONE JSON object and nothing else, with exactly these string keys:
${PROFILE_FIELDS.map((f) => `- "${f.key}": ${f.label}`).join("\n")}

Field guidance:
- identity_line: one sentence a person could use to recognise the character at a glance.
- face: face shape, eyes (shape, colour), brows, nose, lips, jaw and cheekbones.
- hair: colour, length, texture, parting, hairline.
- skin: skin tone, freckles, moles, scars, tattoos, with their locations.
- body: build, proportions, shoulders, waist, hips, legs as visible.
- distinctive_traits: anything that makes this person instantly recognisable.
- signature_accessories: jewellery or accessories seen consistently, plus the "Always keep" item if given.
Keep each value under 400 characters, in concrete visual language.`,
    text: `Known details:\n${known.join("\n")}\n\nImages:\n${list}`,
    images: images.map((i) => i.dataUri),
  };
}

const profileSchema = z.object(
  Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, z.string().optional()])) as Record<string, z.ZodOptional<z.ZodString>>,
);

/** Pulls the JSON object out of a model reply, tolerating code fences and chatter around it. */
export function parseProfileResponse(text: string): CharacterProfile {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return a profile. Try again.");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The model returned a profile that could not be read. Try again.");
  }
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The model returned an unexpected profile format. Try again.");
  const profile: CharacterProfile = {};
  for (const { key } of PROFILE_FIELDS) {
    const v = parsed.data[key]?.trim();
    if (v) profile[key] = v.slice(0, 2000);
  }
  return profile;
}
