// Browser-safe numbers for the UGC tool; the prompt text itself stays on the server (src/lib/ai/prompts/ugc.ts).

/** Photos of the product: several angles of one product, or the items of one set. */
export const MAX_PRODUCT_PHOTOS = 4;
/** Photos made from one press. */
export const MAX_UGC_SHOTS = 4;
export const DEFAULT_UGC_SHOTS = 1;
/** The person's optional note. */
export const MAX_UGC_NOTE = 400;

/** One planned photo, as the browser holds it and sends it back to be generated. */
export interface UgcShot {
  title: string;
  /** What she does with the product, as the rest of a sentence that starts with "She". */
  action: string;
  /** The place, her pose, who holds the phone, and the light. */
  scene: string;
  outfit: string;
}

/** What was read from the product photos, shared by every shot. */
export interface UgcProduct {
  product: string;
  /** The main words printed on it, or "". */
  label: string;
  /** The look the product suggests, shown on the page ("sunny coastal, laid-back"). */
  aesthetic: string;
  /** She wears it (a hat, clothing, jewellery, shoes, a bag) rather than holds or uses it. */
  worn: boolean;
}
