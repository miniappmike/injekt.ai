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
