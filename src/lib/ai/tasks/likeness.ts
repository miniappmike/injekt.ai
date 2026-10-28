import { z } from "zod";
import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import { extractJson } from "../json";
import type { TaskInput } from "../master-prompt";
import type { LabeledImage } from "./profile-builder";
import { legacyTask, REALISM_INSTRUCTIONS, withRealism } from "./realism";

export const LIKENESS_TRAITS = [
  "Face shape",
  "Eyes",
  "Brows",
  "Nose",
  "Lips",
  "Jaw and cheekbones",
  "Hair",
  "Skin",
  "Build",
  "Body proportions",
];

export function buildLikenessTask(args: {
  character: { name: string; always_keep?: string | null; profile: CharacterProfile };
  references: LabeledImage[];
  generated: LabeledImage;
  promptUsed?: string;
}): TaskInput {
  const { character, references, generated, promptUsed } = args;
  const images = [...references, generated];
  const profileText = PROFILE_FIELDS.map((f) => character.profile[f.key] && `${f.label}: ${character.profile[f.key]}`)
    .filter(Boolean)
    .join("\n");
  const generatedLabel = `@image${images.length}`;

  return legacyTask({
    instructions: `Task: score how closely the generated image (${generatedLabel}) matches the character in the reference images.

Compare trait by trait. Score each trait from 0 to 10 and give an overall score from 0 to 100.
For every trait write what the reference shows, what the generated image shows, and a short "fix" phrase that can be
pasted into an image prompt to close the gap (for a trait that already matches, the fix keeps it, for example "keep ...").

Return ONE JSON object and nothing else:
{
  "overall": number,
  "summary": string,
  "traits": [{ "name": string, "score": number, "reference": string, "generated": string, "fix": string }],
  "fix_phrases": [string],
  "edit_prompt": string
}
Use exactly these trait names, in this order: ${LIKENESS_TRAITS.join(", ")}.
"fix_phrases" lists the most useful fixes to add to a prompt, best first, at most 6.
"edit_prompt" is a ready-to-use prompt that edits ${generatedLabel} to fix the biggest gaps while keeping everything else
(pose, setting, lighting, framing). Refer to the references by their @imageN labels.
For "edit_prompt" only: ${REALISM_INSTRUCTIONS}`,
    text: `Character: ${character.name}
${profileText || "(no saved profile yet, rely on the reference images)"}
${character.always_keep ? `Always keep: ${character.always_keep}` : ""}
${promptUsed?.trim() ? `\nPrompt used to make the generated image:\n${promptUsed.trim().slice(0, 4000)}` : ""}

Images:
${references.map((r, i) => `@image${i + 1}: ${r.label}`).join("\n")}
${generatedLabel}: generated image to check`.replace(/\n{3,}/g, "\n\n"),
    images: images.map((i) => i.dataUri),
  });
}

const text = z.coerce.string().trim();
// A score that is not a number becomes NaN and is dealt with below, instead of failing the whole report.
const number = z.coerce.number().catch(Number.NaN);
const reportSchema = z.object({
  overall: number,
  summary: text.default(""),
  traits: z
    .array(z.object({ name: text, score: number, reference: text.default(""), generated: text.default(""), fix: text.default("") }))
    .default([]),
  fix_phrases: z.array(text).default([]),
  edit_prompt: text.default(""),
});

export interface LikenessReport {
  overall: number;
  summary: string;
  traits: { name: string; score: number; reference: string; generated: string; fix: string }[];
  fixPhrases: string[];
  editPrompt: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(Math.round(n), min), max);

export function parseLikenessReport(reply: string): LikenessReport {
  const parsed = reportSchema.safeParse(extractJson(reply));
  if (!parsed.success) throw new Error("The model returned a report in an unexpected format. Try again.");
  const r = parsed.data;
  if (!Number.isFinite(r.overall)) throw new Error("The model returned a report without a score. Try again.");
  return {
    overall: clamp(r.overall, 0, 100),
    summary: r.summary,
    traits: r.traits
      .filter((t) => t.name && Number.isFinite(t.score))
      .map((t) => ({ ...t, score: clamp(t.score, 0, 10) })),
    fixPhrases: r.fix_phrases.filter(Boolean).slice(0, 6),
    editPrompt: withRealism(r.edit_prompt),
  };
}

/** Plain text of a report's actionable parts, for the history list. */
export function likenessReportText(r: LikenessReport): string {
  return [
    `Overall: ${r.overall}/100`,
    r.summary,
    r.fixPhrases.length ? `Fix phrases:\n${r.fixPhrases.map((p) => `- ${p}`).join("\n")}` : "",
    r.editPrompt ? `Edit prompt:\n${r.editPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
