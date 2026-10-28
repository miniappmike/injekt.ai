// Browser-safe choices for Variants. The prompt text itself stays on the server (src/lib/ai/prompts/variants.ts).

/** What an edit may change (artifact VDIMS). */
export const VARIANT_DIMS = [
  { id: "pose", label: "Pose" },
  { id: "angle", label: "Camera angle" },
  { id: "expression", label: "Expression" },
  { id: "hair", label: "Hairstyle" },
  { id: "scene", label: "Scene" },
  { id: "colours", label: "Outfit colours" },
  { id: "outfit", label: "Different outfit" },
  { id: "light", label: "Light or time of day" },
] as const;
export type VariantDimId = (typeof VARIANT_DIMS)[number]["id"];

/** Carousel slide types (artifact CAR_TYPES), with the names shown on each slide. */
export const CAROUSEL_TYPES = [
  { id: "pose", label: "Pose & angle" },
  { id: "model_alt", label: "Her, new spot" },
  { id: "detail", label: "Outfit detail" },
  { id: "flatlay", label: "Flat lay" },
  { id: "object", label: "Object close-up" },
  { id: "environment", label: "The place" },
  { id: "food", label: "Food or drink" },
  { id: "ambient", label: "Artsy shot" },
] as const;
export type CarouselTypeId = (typeof CAROUSEL_TYPES)[number]["id"];
export const carouselTypeLabel = (id: string) => CAROUSEL_TYPES.find((t) => t.id === id)?.label ?? id;

export const MAX_VARIANT_COUNT = 5;
export const DEFAULT_VARIANT_COUNT = 4;
/** New slides after the cover. */
export const MAX_NEW_SLIDES = 5;
export const DEFAULT_NEW_SLIDES = 4;
/** Extra images (vibe, outfit) a user can add after the main one. */
export const MAX_EXTRA_IMAGES = 2;

export type SlidePerson = "full" | "partial" | "none";
