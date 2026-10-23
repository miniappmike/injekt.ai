import { z } from "zod";
import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import { extractJson } from "../json";
import type { TaskInput } from "../master-prompt";
import type { LabeledImage } from "./profile-builder";

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

export function buildVariantTask(args: {
  character: CharacterContext | null;
  references: LabeledImage[];
  image: LabeledImage;
  options: VariantOptionId[];
  note?: string;
}): TaskInput {
  const { character, references, image, options, note } = args;
  const { all, target, lines } = imageList(references, image, "image to edit");
  const chosen = VARIANT_OPTIONS.filter((o) => options.includes(o.id));

  return {
    instructions: `Task: write one image-editing prompt per requested variant of the image to edit (${target}).

Each prompt must start with "Edit ${target}." and change ONLY the one aspect it is about. Everything else stays exactly as
it is in ${target}: the person's face, hair, body and identity${references.length ? `, which the reference images (${references.map((_, i) => `@image${i + 1}`).join(", ")}) define strictly` : ""}, plus outfit, setting, lighting and framing unless that variant changes them.
Be specific and concrete so the edit is unambiguous. Each prompt stands on its own.

Variants to write, in this order:
${chosen.map((o, i) => `${i + 1}. ${o.label}: change ${o.change}`).join("\n")}

Return ONE JSON object and nothing else:
{ "variants": [{ "label": string, "prompt": string }] }
Give each variant a short specific label (for example "Pose · mid-stride on the stairs"), one entry per variant above.`,
    text: `${character ? `Character: ${character.name}\n${profileLines(character) || "(no saved profile yet)"}\n${character.always_keep ? `Always keep: ${character.always_keep}` : ""}\n` : "No saved character: describe the person only from the image.\n"}
${note?.trim() ? `Note from the user: ${note.trim().slice(0, 1000)}\n` : ""}
Images:
${lines.join("\n")}`.replace(/\n{3,}/g, "\n\n"),
    images: all.map((i) => i.dataUri),
  };
}

export function buildCarouselTask(args: {
  character: CharacterContext | null;
  references: LabeledImage[];
  cover: LabeledImage;
  slides: number;
  note?: string;
}): TaskInput {
  const { character, references, cover, slides, note } = args;
  const { all, target, lines } = imageList(references, cover, "cover image");

  return {
    instructions: `Task: plan a ${slides}-slide social media carousel that continues from the cover image (${target}) and keeps the same person, style and look across every slide.

Slide 1 is the cover itself. Plan slides 2 to ${slides}. Make them varied: different poses and angles, a new spot, an outfit detail
close-up, a flat lay of the outfit, and so on, as fits the cover. For each slide give a short title and an image-generation prompt
that starts with "Use ${references.length ? "@image1" : target} as the strict identity reference" when a reference is available, refers to ${target} for the style and
world of the cover, and describes the new scene concretely.

Return ONE JSON object and nothing else:
{ "slides": [{ "title": string, "prompt": string }] }
Return exactly ${slides - 1} entries, for slides 2 to ${slides}, in order.`,
    text: `${character ? `Character: ${character.name}\n${profileLines(character) || "(no saved profile yet)"}\n${character.always_keep ? `Always keep: ${character.always_keep}` : ""}\n` : "No saved character: describe the person only from the cover image.\n"}
${note?.trim() ? `Theme or note from the user: ${note.trim().slice(0, 1000)}\n` : ""}
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
  return out.map((v, i) => ({ label: v.label || `Variant ${i + 1}`, prompt: v.prompt }));
}

export function parseCarousel(reply: string, max: number): { title: string; prompt: string }[] {
  const parsed = z.object({ slides: z.array(z.object({ title: text, prompt: text })) }).safeParse(extractJson(reply));
  if (!parsed.success) throw new Error("The model returned a plan in an unexpected format. Try again.");
  const out = parsed.data.slides.filter((s) => s.prompt).slice(0, max);
  if (!out.length) throw new Error("The model did not plan any slides. Try again.");
  return out.map((s, i) => ({ title: s.title || `Slide ${i + 2}`, prompt: s.prompt }));
}
