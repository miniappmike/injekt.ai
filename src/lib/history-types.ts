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
