export interface HistoryItem {
  id: string;
  characterId: string | null;
  characterName: string;
  kind: string;
  label: string;
  prompt: string;
  thumbnail: string | null;
  createdAt: string;
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
