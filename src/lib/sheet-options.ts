// Browser-safe choices for the reference sheet maker (artifact A13b). The prompt text stays on the server.

export const SHEET_ASPECT_RATIO = { face: "3:2", body: "1:1" } as const;
/** Body photos that can go into the face and body sheet. */
export const MAX_BODY_PHOTOS = 3;

/** The two standard looks, chosen with a toggle before the body sheet is made. */
export const SHEET_LOOKS = [
  { id: "covered", label: "Covered", hint: "White crop tube top and very short shorts, fitted tight" },
  { id: "bikini", label: "Bikini", hint: "Black bikini" },
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
