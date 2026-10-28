import { metaForRun, type InjectMeta } from "@/lib/inject-meta";

/** How the Likeness page's revised prompt is generated. */
export interface RevisedRun {
  kind: "inject" | "variant" | "edit";
  /** Pictures after her references (a variant's photo and extras). */
  extraPaths: string[];
  meta: InjectMeta;
  /** What it sends, under the button. */
  note: string;
}

/** Her references alone, with the revised prompt as written (the Edit tool with no target, her default references). */
export const REFERENCES_RUN: RevisedRun = { kind: "edit", extraPaths: [], meta: {}, note: "Uses her references and the revised prompt." };

/**
 * The run for a revised prompt, from the History entry the image was made from (if any). An Inject prompt runs with
 * the target left out: a photo edit of the target is written from the edit notes, not the prompt, so the revision
 * would not reach the image. A variant sends its photo again, which its @image tags refer to.
 */
export function revisedRun(entry: { kind: string; meta: Record<string, unknown> | null; imagePath: string | null; extraPaths: string[] } | null): RevisedRun {
  if (entry?.kind === "inject" && entry.meta && Object.keys(entry.meta).length)
    return { kind: "inject", extraPaths: [], meta: metaForRun(entry.meta as InjectMeta, null, false), note: "Uses her references and the revised prompt (a new image of the scene, not an edit of the original photo)." };
  if (entry?.kind === "variant" && entry.imagePath)
    return { kind: "variant", extraPaths: [entry.imagePath, ...entry.extraPaths], meta: {}, note: "Uses her references, then the photo the variant was written for, with the revised prompt." };
  return REFERENCES_RUN;
}
