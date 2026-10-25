export interface HistoryItem {
  id: string;
  characterId: string | null;
  characterName: string;
  kind: string;
  label: string;
  prompt: string;
  thumbnail: string | null;
  /** The photo the prompt was written for, sent after the character's references when generating again. */
  imagePath: string | null;
  /** More images sent after imagePath when generating again (vibe or outfit references). */
  extraPaths: string[];
  createdAt: string;
}

/** The image job a saved prompt runs as. Likeness entries hold a report, not an image prompt, so they have none. */
export const HISTORY_GENERATION_KIND = { inject: "inject", variant: "variant", carousel: "carousel" } as const;
export function historyGenerationKind(kind: string) {
  return Object.hasOwn(HISTORY_GENERATION_KIND, kind) ? HISTORY_GENERATION_KIND[kind as keyof typeof HISTORY_GENERATION_KIND] : null;
}

/** An image the person generated, as the History panel shows it. */
export interface GenerationItem {
  id: string;
  kindLabel: string;
  model: string | null;
  prompt: string | null;
  /** generating: still being made. ready: can be viewed and downloaded. expired: past its 72 hours. failed: did not work. */
  state: "generating" | "ready" | "expired" | "failed";
  error: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** What it cost, once known. Null while generating, or when the provider didn't say. */
  costUsd: number | null;
  /** The one free image, paid for by Model Spawn. */
  free: boolean;
  previewUrl: string | null;
  downloadUrl: string | null;
}
