import Link from "next/link";
import { Logo } from "@/components/logo";
import { CONTACT_EMAIL } from "@/lib/links";
import { TO_AUTH } from "./stage";

const LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/#faq", label: "FAQ" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-20 w-full max-w-6xl px-5 pb-10 sm:px-8">
      <div className="flex flex-col gap-6 border-t border-white/15 pt-8 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-xs text-[13px] text-white/70">Create your model once, then put her in any photo.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[13px] font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">{CONTACT_EMAIL}</a>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 md:max-w-md md:justify-end">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[13px] text-white/75 transition-colors hover:text-white">{l.label}</Link>
          ))}
          <Link href="/login" transitionTypes={TO_AUTH} className="text-[13px] text-white/75 transition-colors hover:text-white">Log In</Link>
        </nav>
      </div>
      <p className="mt-8 text-xs text-white/60">© {new Date().getFullYear()} ModelSpawn. For adults, 18 and over.</p>
    </footer>
  );
}
