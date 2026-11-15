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

/** The rest of the menu, under "More". (Group photo is a mode of the Characters page, reached from there.) */
export const MORE_NAV = [
  { href: "/characters", label: "Characters" },
  { href: "/reference-sheet", label: "Create Model" },
  { href: "/likeness", label: "Likeness" },
  { href: "/art-to-real", label: "Art to Real" },
] as const;

/** The phone dock is the same menu: the five tabs, then More. */
export const DOCK_NAV = NAV;
export const DOCK_MORE = MORE_NAV;
