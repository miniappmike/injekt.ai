/** The site's main tools, in order. The desktop tabs and the phone dock both read this, so they always match. */
export const NAV = [
  { href: "/inject", label: "Inject" },
  { href: "/director", label: "Director" },
  { href: "/variants", label: "Variants" },
  { href: "/reference-sheet", label: "Create Model" },
  { href: "/characters", label: "Characters" },
  { href: "/marketplace", label: "Marketplace" },
] as const;
export type NavHref = (typeof NAV)[number]["href"];
