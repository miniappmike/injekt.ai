/**
 * Her own phone (set on her character page): a description and/or a photo. Whenever a phone shows up in a shot, the
 * prompt writers name her phone instead of a generic one.
 */
import { fence } from "./rules";

export const MAX_PHONE_DESCRIPTION = 300;

export interface CharacterPhone {
  description: string | null;
  /** The photo of her phone is one of the images the writer sees; this is how that image is named to it. */
  imageLabel?: string | null;
}

/** A rule for a prompt WRITER (a model that reads the photo and writes the prompt). Empty when she has no phone set. */
export function phoneWriterRule(p: CharacterPhone | null | undefined): string {
  const desc = p?.description?.replace(/\s+/g, " ").trim();
  if (!desc && !p?.imageLabel) return "";
  const what = [desc && `"${fence(desc).slice(0, MAX_PHONE_DESCRIPTION)}"`, p?.imageLabel && `exactly as it looks in ${p.imageLabel} (its model, colour, case and camera layout)`].filter(Boolean).join(", ");
  return `HER PHONE: if a phone appears or is held in the shot (a mirror selfie, in her hand, on a table), it is always her own phone, ${what}. Describe it concretely in the prompt by its look, never as a generic phone. Don't add a phone that isn't in the shot.${p?.imageLabel ? ` ${p.imageLabel} is only for the phone: take nothing else from it.` : ""}`;
}

/** A line for a prompt sent straight to the image model (no writer step). Empty when she has no description. */
export function phoneImageLine(description: string | null | undefined): string {
  const desc = description?.replace(/\s+/g, " ").trim();
  return desc ? `If she holds or uses a phone, it is her own: ${fence(desc).slice(0, MAX_PHONE_DESCRIPTION)}.` : "";
}
