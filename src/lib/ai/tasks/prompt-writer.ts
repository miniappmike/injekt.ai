import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import type { TaskInput } from "../master-prompt";
import type { LabeledImage } from "./profile-builder";

export type PromptStyle = "sectioned" | "match";

const STYLE_INSTRUCTIONS: Record<PromptStyle, string> = {
  sectioned: `Format: labelled sections, each on its own line, in this order:
Identity: / Face and hair: / Body: / Outfit: / Pose and expression: / Setting and lighting: / Camera and framing: / Keep:
Each section is one or two concrete sentences.`,
  match: `Format: one flowing paragraph. Mirror the target photo closely (pose, expression, setting, lighting, camera angle,
framing) and describe the character's identity in the same paragraph so the result reads as one scene.`,
};

export function buildReplacementPromptTask(args: {
  character: { name: string; always_keep?: string | null; height?: string | null; weight?: string | null; profile: CharacterProfile };
  references: LabeledImage[];
  target: LabeledImage;
  outfit?: string;
  style: PromptStyle;
}): TaskInput {
  const { character, references, target, outfit, style } = args;
  const images = [...references, target];
  const profileText = PROFILE_FIELDS.map((f) => character.profile[f.key] && `${f.label}: ${character.profile[f.key]}`)
    .filter(Boolean)
    .join("\n");
  const ref = references.map((r, i) => `@image${i + 1}: ${r.label}`).join("\n");
  const targetLabel = `@image${images.length}`;

  return {
    instructions: `Task: write one replacement prompt for an image-editing model. The result must show ${character.name}
in the scene of the target photo (${targetLabel}), with the character's identity taken from the reference images.

Rules for this task:
- Start by naming the references: say that ${references.length ? "@image1" + (references.length > 1 ? `-@image${references.length}` : "") : "the references"} define the identity strictly and ${targetLabel} is the scene to edit.
- Keep the target's pose, setting, lighting and framing unless the user's outfit note says otherwise.
- Replace the person in the target with the character. Do not describe the original person.
${STYLE_INSTRUCTIONS[style]}
Output only the prompt text.`,
    text: `Character: ${character.name}
${profileText || "(no saved profile yet, rely on the reference images)"}
${character.always_keep ? `Always keep: ${character.always_keep}` : ""}
${character.height ? `Height: ${character.height}` : ""}
${outfit?.trim() ? `\nOutfit note from the user: ${outfit.trim().slice(0, 1000)}` : "\nOutfit: keep what the target shows."}

Images:
${ref}
${targetLabel}: target photo (scene to edit)`.replace(/\n{3,}/g, "\n\n"),
    images: images.map((i) => i.dataUri),
  };
}
