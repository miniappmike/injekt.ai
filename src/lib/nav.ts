/**
 * The site's main tools, in the order you use them: make or pick a model (Create Model, Characters), the Marketplace in
 * the middle, then the tools that put her in photos (Inject, Director, Variants). The desktop tabs and the phone dock
 * both read this, so they always match.
 */
export const NAV = [
  { href: "/reference-sheet", label: "Create Model" },
  { href: "/characters", label: "Characters" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/inject", label: "Inject" },
  { href: "/director", label: "Director" },
  { href: "/variants", label: "Variants" },
] as const;
export type NavHref = (typeof NAV)[number]["href"];

/** The tools without a tab of their own, kept under "More". Group photo is a mode of the Characters page. */
export const MORE_NAV = [
  { href: "/likeness", label: "Likeness", hint: "Score how close an image is to her" },
  { href: "/art-to-real", label: "Art to Real", hint: "Turn artwork into a realistic photo" },
  { href: "/characters#group", label: "Group photo", hint: "Several characters in one picture" },
] as const;

/**
 * The phone dock, ordered by how a session goes rather than by how the tabs read: open your models, put her in a
 * photo (Inject), or describe one (Director), then multiply the good ones (Variants). Everything used less often,
 * or once, is one tap away under More, most-used first: checking a result, making a new model, the marketplace.
 */
export const DOCK_NAV = [
  { href: "/characters", label: "Characters" },
  { href: "/inject", label: "Inject" },
  { href: "/director", label: "Director" },
  { href: "/variants", label: "Variants" },
] as const;
export const DOCK_MORE = [
  { href: "/likeness", label: "Likeness" },
  { href: "/reference-sheet", label: "Create Model" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/art-to-real", label: "Art to Real" },
  { href: "/characters#group", label: "Group photo" },
] as const;
