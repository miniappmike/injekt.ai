import { z } from "zod";

// Browser-safe: the prompt text itself stays on the server (src/lib/ai/prompts).
export const POSE_MODES = ["keep", "natural", "social"] as const;
export const PROMPT_STYLES = ["full", "narrative", "short"] as const;
export const WARDROBES = ["match", "signature", "extracted"] as const;
export const MAX_VERSIONS = 4;

/**
 * What an Inject prompt carries besides its text, so the server can frame it for the image model. With a target the
 * job is a photo edit: the target photo plus her references, and only the short EDIT line as the change.
 */
export const injectMetaSchema = z.object({
  /** The target photo, when it may be sent to the image model ("Edit the target photo" on). */
  target: z.string().max(300).optional(),
  edit: z.string().max(600).optional(),
  frame: z.string().max(200).optional(),
  outfit: z.string().max(300).optional(),
  clean: z.boolean().optional(),
  chg: z
    .object({ pose: z.boolean().optional(), outfit: z.boolean().optional(), hair: z.boolean().optional(), who: z.string().max(200).optional() })
    .optional(),
  // Likeness fix and face fix: the generated image to repaint (or the first extra path), and what to correct.
  sourceGeneration: z.string().uuid().optional(),
  fixes: z.array(z.string().max(200)).max(8).optional(),
  /** Face fix: also match her hair colour and hairline. */
  matchHair: z.boolean().optional(),
  /** Face fix: a short note from the person. */
  note: z.string().max(160).optional(),
  /** Carousel: who is in the slide; the prompt carries {REF}, {PHOTO} and {EXTRAn} placeholders. */
  person: z.enum(["full", "partial", "none"]).optional(),
  /** Direct swap: which person to replace, and extra direction added when it fits. */
  who: z.string().max(200).optional(),
  extra: z.string().max(2000).optional(),
  /** Edit: which of her references to send after the target (ids from refOptions). */
  refs: z.array(z.string().max(20)).max(12).optional(),
  /** Reference sheet: which sheet, whether @image1 is a face sheet (or a face photo), and the outfit and body options. */
  sheet: z
    .object({
      kind: z.enum(["face", "body"]),
      hasSheet: z.boolean().optional(),
      outfit: z.enum(["default", "photo", "custom"]).optional(),
      outfitText: z.string().max(500).optional(),
      gluteSize: z.string().max(20).optional(),
      gluteShape: z.string().max(20).optional(),
      cup: z.string().max(4).optional(),
    })
    .optional(),
});
export type InjectMeta = z.infer<typeof injectMetaSchema>;
/** What a likeness fix or face fix carries (the same schema; the job builder reads only its own fields). */
export type FixMeta = Pick<InjectMeta, "sourceGeneration" | "fixes" | "matchHair" | "note" | "frame">;

/** The Inject options as the browser sends them (artifact readOpts). */
export const injectOptionsSchema = z.object({
  mode: z.enum(["ref", "text"]).default("ref"),
  len: z.enum(PROMPT_STYLES).default("full"),
  ward: z.enum(WARDROBES).default("match"),
  who: z.string().trim().max(200).default(""),
  extra: z.string().trim().max(2000).default(""),
  tag: z.string().trim().max(40).default("@image1"),
  exText: z.string().trim().max(2000).default(""),
  poseMode: z.enum(POSE_MODES).default("keep"),
  count: z.coerce.number().int().min(1).max(MAX_VERSIONS).default(1),
  recolor: z.boolean().default(false),
  hair: z.boolean().default(false),
  newOutfit: z.boolean().default(false),
  /** Also send her reference photos to the prompt writer (costs more). */
  withRefs: z.boolean().default(false),
  /** The targets were cleaned of overlays: the prompt and the image job leave them out. */
  clean: z.boolean().default(false),
});
export type InjectOptionsInput = z.input<typeof injectOptionsSchema>;
export const INJECT_DEFAULTS = injectOptionsSchema.parse({});

/** The "Edit the target photo" setting (artifact ws.base), kept in the browser and on by default. */
export const EDIT_TARGET_KEY = "ms.editTarget";
export function readEditTarget(): boolean {
  try {
    return localStorage.getItem(EDIT_TARGET_KEY) !== "0";
  } catch {
    return true;
  }
}
export function writeEditTarget(on: boolean) {
  try {
    localStorage.setItem(EDIT_TARGET_KEY, on ? "1" : "0");
  } catch {
    // Private windows can refuse storage; the setting then lasts for this page only.
  }
}

/** The meta a saved Inject prompt runs with: the target is sent only when "Edit the target photo" is on. */
export const metaForRun = (meta: InjectMeta, target: string | null, editTarget: boolean): InjectMeta => {
  const { target: _t, ...rest } = meta;
  return editTarget && target ? { ...rest, target } : rest;
};
