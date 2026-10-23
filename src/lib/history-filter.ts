import type { HistoryItem } from "./history-types";

/** Search matches the label or the prompt text, ignoring case; an empty character id means everyone. */
export function filterHistory(items: HistoryItem[], query: string, characterId: string): HistoryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (i) => (!characterId || i.characterId === characterId) && (!q || `${i.label} ${i.prompt}`.toLowerCase().includes(q)),
  );
}

/** Characters that have entries, for the filter list (so a deleted character still appears under its entries). */
export function historyCharacters(items: HistoryItem[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const i of items) if (i.characterId && !seen.has(i.characterId)) seen.set(i.characterId, i.characterName);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
