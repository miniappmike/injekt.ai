import { z } from "zod";
import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import { extractJson } from "../json";
import type { TaskInput } from "../master-prompt";
import type { LabeledImage } from "./profile-builder";
import { REALISM_INSTRUCTIONS, withRealism } from "./realism";

export const VARIANT_OPTIONS = [
  { id: "pose", label: "Pose", change: "the pose and body position" },
  { id: "camera", label: "Camera angle", change: "the camera angle and framing" },
  { id: "hairstyle", label: "Hairstyle", change: "the hairstyle (keep the hair colour)" },
  { id: "colours", label: "Outfit colours", change: "the colours of the outfit" },
  { id: "expression", label: "Expression", change: "the facial expression" },
  { id: "setting", label: "Setting", change: "the location and background" },
  { id: "lighting", label: "Lighting", change: "the lighting and time of day" },
  { id: "accessories", label: "Accessories", change: "the accessories" },
] as const;

export type VariantOptionId = (typeof VARIANT_OPTIONS)[number]["id"];

interface CharacterContext {
  name: string;
  always_keep?: string | null;
  profile: CharacterProfile;
}

const profileLines = (c: CharacterContext) =>
  PROFILE_FIELDS.map((f) => c.profile[f.key] && `${f.label}: ${c.profile[f.key]}`)
    .filter(Boolean)
    .join("\n");

function imageList(references: LabeledImage[], image: LabeledImage, imageLabel: string) {
  const all = [...references, image];
  const lines = [...references.map((r, i) => `@image${i + 1}: ${r.label}`), `@image${all.length}: ${imageLabel}`];
  return { all, target: `@image${all.length}`, lines };
}

/** What the user should attach, in order, when they run the prompts elsewhere. */
export const attachOrder = (references: LabeledImage[], imageLabel: string) =>
  [...references.map((r) => r.label), imageLabel].map((label, i) => `@image${i + 1}: ${label}`);

/** How many variants Edits mode writes when the user doesn't choose. */
export const DEFAULT_VARIANT_COUNT = 4;
export const MAX_VARIANT_COUNT = 8;

const identityRule = (references: LabeledImage[]) =>
  references.length
    ? `Use ${references.map((r, i) => `@image${i + 1} (${r.label})`).join(" and ")} as the strict identity reference for the face, hair, skin and build.`
    : "There are no reference sheets, so keep the person exactly as they appear in the photo.";

const characterText = (character: CharacterContext | null, fallback: string) =>
  character
    ? `Character: ${character.name}\n${profileLines(character) || "(no saved profile yet)"}\n${character.always_keep ? `Always keep: ${character.always_keep}` : ""}\n`
    : `${fallback}\n`;

// Edits mode: several variations of one photo. Every prompt changes all the chosen aspects together, and only those.
export function buildVariantTask(args: {
  character: CharacterContext | null;
  references: LabeledImage[];
  image: LabeledImage;
  options: VariantOptionId[];
  count?: number;
  note?: string;
}): TaskInput {
  const { character, references, image, options, note } = args;
  const count = Math.min(Math.max(Math.round(args.count ?? DEFAULT_VARIANT_COUNT) || DEFAULT_VARIANT_COUNT, 1), MAX_VARIANT_COUNT);
  const { all, target, lines } = imageList(references, image, "image to edit");
  const chosen = VARIANT_OPTIONS.filter((o) => options.includes(o.id));
  const keep = VARIANT_OPTIONS.filter((o) => !options.includes(o.id));

  return {
    instructions: `Task: write ${count} image-editing prompt${count === 1 ? "" : "s"}, each making a different variation of the photo to edit (${target}).

Every prompt changes ALL of these together, and nothing else:
${chosen.map((o) => `- ${o.change}`).join("\n")}
${keep.length ? `Everything else stays exactly as it is in ${target}: ${keep.map((o) => o.change.replace(/ \(.*\)$/, "")).join(", ")}.` : ""}
Make the ${count} variations clearly different from each other, like alternate shots from the same moment. Be specific and concrete.

Each prompt starts with "Edit ${target}." ${identityRule(references)} Each prompt stands on its own.
${REALISM_INSTRUCTIONS}

Return ONE JSON object and nothing else:
{ "variants": [{ "label": string, "prompt": string }] }
Exactly ${count} entries. Give each a short specific label that says what this variation is (for example "Leaning on the railing, low angle").`,
    text: `${characterText(character, "No saved character: describe the person only from the image.")}
${note?.trim() ? `Note from the user: ${note.trim().slice(0, 1000)}\n` : ""}
Images:
${lines.join("\n")}`.replace(/\n{3,}/g, "\n\n"),
    images: all.map((i) => i.dataUri),
  };
}

// Carousel mode: the model acts as a social media creative director and plans the rest of an Instagram carousel from the
// cover and the user's theme, with full creative freedom over what each slide is.
export function buildCarouselTask(args: {
  character: CharacterContext | null;
  references: LabeledImage[];
  cover: LabeledImage;
  slides: number;
  note?: string;
}): TaskInput {
  const { character, references, cover, slides, note } = args;
  const { all, target, lines } = imageList(references, cover, "cover image");
  const theme = note?.trim();

  return {
    instructions: `You are a creative director for social media, with an expert eye for poses, vibes and aesthetics. Study the cover image (${target})
closely: the outfit, setting, light, mood, colour and the kind of creator who would post it.${theme ? " Then read the user's theme and let it steer every slide." : ""}

Plan the rest of a ${slides}-slide Instagram carousel. Slide 1 is the cover. Write slides 2 to ${slides} the way a real creator's carousel works:
the same person, outfit and day as the cover, as if shot in the same session on a phone, but every slide earns its place with a new pose,
angle, framing, moment or detail that fits the vibe. You decide what each slide is; don't follow a formula, and don't repeat a shot.

For each slide write an image-editing prompt that starts with "Edit ${target}." and describes the new shot concretely: pose, body language,
expression, camera angle and distance, framing and what is in view. Keep the outfit, setting, styling and colour of ${target} unless the slide
is deliberately a different spot from the same day. ${identityRule(references)}
${REALISM_INSTRUCTIONS}

Return ONE JSON object and nothing else:
{ "slides": [{ "title": string, "prompt": string }] }
Exactly ${slides - 1} entries, for slides 2 to ${slides}, in order. Give each a short title that says what the shot is.`,
    text: `${characterText(character, "No saved character: describe the person only from the cover image.")}
${theme ? `Theme from the user: ${theme.slice(0, 1000)}\n` : "No theme given: take the direction from the cover.\n"}
Images:
${lines.join("\n")}`.replace(/\n{3,}/g, "\n\n"),
    images: all.map((i) => i.dataUri),
  };
}

const text = z.coerce.string().trim();

export function parseVariants(reply: string, max: number): { label: string; prompt: string }[] {
  const parsed = z.object({ variants: z.array(z.object({ label: text, prompt: text })) }).safeParse(extractJson(reply));
  if (!parsed.success) throw new Error("The model returned variants in an unexpected format. Try again.");
  const out = parsed.data.variants.filter((v) => v.prompt).slice(0, max);
  if (!out.length) throw new Error("The model did not write any variants. Try again.");
  return out.map((v, i) => ({ label: v.label || `Variant ${i + 1}`, prompt: withRealism(v.prompt) }));
}

export function parseCarousel(reply: string, max: number): { title: string; prompt: string }[] {
  const parsed = z.object({ slides: z.array(z.object({ title: text, prompt: text })) }).safeParse(extractJson(reply));
  if (!parsed.success) throw new Error("The model returned a plan in an unexpected format. Try again.");
  const out = parsed.data.slides.filter((s) => s.prompt).slice(0, max);
  if (!out.length) throw new Error("The model did not plan any slides. Try again.");
  return out.map((s, i) => ({ title: s.title || `Slide ${i + 2}`, prompt: withRealism(s.prompt) }));
}
