import Link from "next/link";
import { Logo } from "@/components/logo";
import { GET_KEY_PATH, REFERRAL_DISCLOSURE } from "@/lib/links";

type FooterLink = { label: string; href?: string; soon?: boolean };

/** The site map along the bottom of every page: the main tools, the extras that don't need a top tab, and legal. */
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Create",
    links: [
      { label: "Inject", href: "/inject" },
      { label: "Variants", href: "/variants" },
      { label: "Likeness", href: "/likeness" },
      { label: "Create Model", href: "/reference-sheet" },
    ],
  },
  {
    title: "Tools",
    links: [
      { label: "Marketplace", href: "/marketplace" },
      { label: "Art to Real", href: "/art-to-real" },
      { label: "Group photo", href: "/characters" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Get Credits", soon: true },
      { label: "Characters", href: "/characters" },
      { label: "Settings", href: "/settings/api-keys" },
      { label: "Ledger", href: "/ledger" },
      { label: "API key guide", href: GET_KEY_PATH },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", soon: true },
      { label: "Privacy Policy", soon: true },
    ],
  },
];

export function AppFooter() {
  return (
    <footer className="border-t border-neutral-800/80 bg-neutral-950/40">
      {/* Phones keep room under it for the floating dock. */}
      <div className="mx-auto grid max-w-6xl gap-6 px-6 pb-8 pt-7 2xl:max-w-[88rem] lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] max-sm:px-4 max-sm:pb-28 max-sm:pt-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-xs text-[13px] text-neutral-500">Create your model once, then put her in any photo.</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-neutral-600">{REFERRAL_DISCLOSURE}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:contents">
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{col.title}</p>
              <ul className="flex flex-col gap-1">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <Link href={l.href} className="text-[13px] text-neutral-300 transition-colors hover:text-white">{l.label}</Link>
                    ) : (
                      <span className="text-[13px] text-neutral-600">
                        {l.label} {l.soon && <span className="ml-1 rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">Soon</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="sr-only">© Model Spawn</div>
    </footer>
  );
}
