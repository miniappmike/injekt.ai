// Browser-safe choices for the reference sheet maker (artifact A13b). The prompt text stays on the server.

export const SHEET_ASPECT_RATIO = { face: "4:5", body: "16:9" } as const;
/** Body photos that can go into the face and body sheet. */
export const MAX_BODY_PHOTOS = 2;

export const SHEET_OUTFITS = [
  { id: "default", label: "Plain white athletic set" },
  { id: "photo", label: "The outfit from body photo 1" },
  { id: "custom", label: "Describe an outfit" },
] as const;
export const GLUTE_SIZES = [
  { id: "match", label: "As in the photos" },
  { id: "smaller", label: "Smaller" },
  { id: "ssmaller", label: "Slightly smaller" },
  { id: "slarger", label: "Slightly larger" },
  { id: "larger", label: "Larger" },
  { id: "xlarger", label: "Much larger" },
] as const;
export const GLUTE_SHAPES = [
  { id: "match", label: "As in the photos" },
  { id: "round", label: "Round" },
  { id: "heart", label: "Heart" },
  { id: "lifted", label: "Lifted" },
  { id: "athletic", label: "Athletic" },
  { id: "soft", label: "Soft" },
] as const;
export const CUPS = ["match", "A", "B", "C", "D", "DD", "E", "F"] as const;
