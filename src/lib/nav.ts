/**
 * The site's main menu, in the order you use it: the dashboard, then the tools that put her in photos (Inject,
 * Variants, Director), then the Marketplace. Everything else is under More. The desktop tabs and the phone dock both
 * read this, so they always match.
 */
export const NAV = [
  { href: "/home", label: "Dashboard" },
  { href: "/inject", label: "Inject" },
  { href: "/variants", label: "Variants" },
  { href: "/director", label: "Director" },
  { href: "/marketplace", label: "Marketplace" },
] as const;
export type NavHref = (typeof NAV)[number]["href"];

/** The rest of the menu, under "More". Group photo is a mode of the Characters page. */
export const MORE_NAV = [
  { href: "/characters", label: "Characters", hint: "Your models and their reference photos" },
  { href: "/reference-sheet", label: "Create Model", hint: "Build a new model from your photos" },
  { href: "/likeness", label: "Likeness", hint: "Score how close an image is to her" },
  { href: "/art-to-real", label: "Art to Real", hint: "Turn artwork into a realistic photo" },
  { href: "/characters#group", label: "Group photo", hint: "Several characters in one picture" },
] as const;

/** The phone dock is the same menu: the five tabs, then More. */
export const DOCK_NAV = NAV;
export const DOCK_MORE = MORE_NAV;
