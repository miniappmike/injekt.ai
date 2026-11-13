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
/** The choices shown for a set of moments: each one switches a few related slide types on or off together. */
export const MOMENT_GROUPS = [
  { id: "her", label: "More of her", types: ["pose", "model_alt"] },
  { id: "outfit", label: "Outfit & details", types: ["detail", "flatlay", "object"] },
  { id: "place", label: "The place", types: ["environment", "ambient"] },
  { id: "food", label: "Food & drink", types: ["food"] },
] as const satisfies readonly { id: string; label: string; types: readonly CarouselTypeId[] }[];
/** Platforms grouped by the tone they set, for the "Posting to" menu. "other" is listed on its own. */
export const PLATFORM_TONES = [
  { label: "Social-safe", ids: ["instagram", "tiktok"] },
  { label: "Bolder", ids: ["x", "reddit"] },
  { label: "Subscriber teasers", ids: ["fanvue", "onlyfans"] },
] as const;
export const carouselTypeLabel = (id: string) => CAROUSEL_TYPES.find((t) => t.id === id)?.label ?? id;

export const MAX_VARIANT_COUNT = 5;
export const DEFAULT_VARIANT_COUNT = 4;
/** New slides after the cover. */
export const MAX_NEW_SLIDES = 5;
export const DEFAULT_NEW_SLIDES = 4;
/** "Write only": variations the creative director writes as finished prompts for another generator. */
export const MAX_WRITE_ONLY = 8;
export const DEFAULT_WRITE_ONLY = 4;
/** Where a carousel or Write only set will be posted, which sets its tone and how spicy it is. */
export const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
  { id: "reddit", label: "Reddit" },
  { id: "fanvue", label: "Fanvue" },
  { id: "onlyfans", label: "OnlyFans" },
  { id: "other", label: "Other" },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];
export const PLATFORM_OTHER_MAX = 80;

/** Write only starts on new shots of her; the other slide types can be turned on. */
export const WRITE_ONLY_TYPES = ["pose", "model_alt"] as const;
/** Extra images (vibe, outfit) a user can add after the main one. */
export const MAX_EXTRA_IMAGES = 2;

export type SlidePerson = "full" | "partial" | "none";
