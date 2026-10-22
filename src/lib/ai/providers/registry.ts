import type { ImageProvider } from "./types";
import { spicyapi } from "./spicyapi";

const imageProviders: Record<string, ImageProvider> = { [spicyapi.id]: spicyapi };

export function getImageProvider(id: string): ImageProvider {
  const p = imageProviders[id];
  if (!p) throw new Error(`Unknown image provider: ${id}`);
  return p;
}
