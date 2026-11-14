/**
 * The pictures in the landing page's collage, one list per column, left to right.
 *
 * Every tile is a placeholder until it has a `src`. To put a real picture in: save it in `public/landing/` and set
 * `src` to its path, e.g. `{ src: "/landing/beach.webp", alt: "Ava on a beach at sunset", ratio: "3/4" }`.
 * `ratio` is the tile's shape (width/height); pictures are cropped to fill it.
 */
export interface LandingImage {
  src?: string;
  /** What the picture shows, for screen readers. Also the note on the empty tile. */
  alt: string;
  ratio: "1/1" | "3/4" | "4/5" | "2/3";
}

export const HERO_COLUMNS: LandingImage[][] = [
  [
    { alt: "Close-up portrait", ratio: "3/4" },
    { alt: "Street style", ratio: "4/5" },
  ],
  [
    { alt: "Mirror selfie", ratio: "4/5" },
    { alt: "Coffee shop", ratio: "1/1" },
    { alt: "Night out", ratio: "3/4" },
  ],
  [
    { alt: "Gym photo", ratio: "1/1" },
    { alt: "Beach at sunset", ratio: "3/4" },
    { alt: "At home", ratio: "4/5" },
  ],
  [
    { alt: "Face sheet", ratio: "1/1" },
    { alt: "Full-body outfit", ratio: "2/3" },
    { alt: "Car selfie", ratio: "1/1" },
  ],
  [
    { alt: "Body sheet", ratio: "4/5" },
    { alt: "Poolside", ratio: "3/4" },
    { alt: "City rooftop", ratio: "1/1" },
  ],
  [
    { alt: "Studio portrait", ratio: "3/4" },
    { alt: "Travel photo", ratio: "4/5" },
    { alt: "Dinner date", ratio: "3/4" },
  ],
];
