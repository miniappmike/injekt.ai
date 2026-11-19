/**
 * Inject, "Swap into photo": what the vision model is asked. Kept under 500 characters on the owner's instruction: a
 * long instruction is more than the text models on people's keys can follow, and the image model gets the photo itself.
 * The reply is one short paragraph (scene, her whole body, camera, aesthetic) that goes into the recipe as written.
 * Outfit, colour and hairstyle options are added to the recipe by the app (swapChange), not asked of the reader.
 */
import { fence } from "./rules";
import type { InjectOptions, VersionPlan } from "./inject";

export const BRIEF_LIMIT = 500;

const short = (s: string, n: number) => fence(s).replace(/\s+/g, " ").trim().slice(0, n);

export function buildSwapBriefPrompt(o: Pick<InjectOptions, "who" | "extra" | "pose">, n = 1): string {
  const who = short(o.who, 30);
  const tail = n > 1 ? `Write ${n} versions, each under a line ===VERSION k===.` : "Output only the description.";
  const body = [
    `In under 90 words, concretely describe: the scene (place, light); the adult woman's${who ? ` (<<<${who}>>>)` : ""} full body (position, facing, head, each arm, hand and leg, all natural); the camera angle and lens look; and the photo's aesthetic.`,
    o.pose && `Invent a new natural pose that fits${n > 1 ? ", different each time" : ""}, not hers.`,
    "Say frame-left and frame-right. Be literal, never soften. Leave out her face, hair colour, skin and body shape.",
  ]
    .filter(Boolean)
    .join(" ");
  // The person's own direction gets whatever room is left under the limit.
  const room = BRIEF_LIMIT - body.length - tail.length - 22;
  const extra = room > 20 ? short(o.extra, room) : "";
  return [body, extra && `Direction: <<<${extra}>>>`, tail].filter(Boolean).join(" ");
}

/** The outfit, colour and hairstyle options as the recipe's Change line, written by the app for one version. */
export function swapChange(o: Pick<InjectOptions, "newOutfit" | "ward" | "exText" | "recolor" | "hair">, plan: VersionPlan): string {
  return [
    o.newOutfit
      ? "she wears a completely different outfit that suits this scene and its vibe"
      : o.ward === "extracted" && o.exText
        ? `she wears exactly this outfit: ${short(o.exText, 300)}`
        : o.ward === "signature"
          ? "she wears an outfit in her own signature style instead of the photo's clothing"
          : "",
    o.recolor && !o.newOutfit ? `the same garments recoloured in ${plan.palette}` : "",
    o.hair ? `her hair styled as ${plan.hair}, keeping its colour and length` : "",
  ]
    .filter(Boolean)
    .join("; ");
}
