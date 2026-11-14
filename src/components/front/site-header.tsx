"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { TO_AUTH } from "./stage";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/marketplace", label: "Marketplace" },
];

/** The floating glass bar on every page a signed-out visitor can open: logo, the few pages there are, Log In and Join Now. */
export function SiteHeader() {
  const pathname = usePathname();
  const links = (className: string) => (
    <nav aria-label="Pages" className={className}>
      {LINKS.map((l) => {
        const on = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
              on && "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <header className="sticky top-0 z-20 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
      {/* A dark fade behind the bar, so page text scrolling under it doesn't show around the pills. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+1.5rem)] bg-[linear-gradient(to_bottom,rgb(13_3_8/0.96)_0%,rgb(13_3_8/0.9)_55%,transparent_100%)]" />
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full border border-white/12 bg-[rgb(14_3_8/0.6)] pl-4 pr-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_18px_40px_-24px_rgb(0_0_0/0.9)] backdrop-blur-2xl sm:pl-5">
        <Link href="/" aria-label="ModelSpawn home" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 max-[379px]:[&_.font-display]:hidden">
          <Logo />
        </Link>
        {links("hidden items-center gap-1 md:flex")}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            transitionTypes={TO_AUTH}
            className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-white/85 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-4"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            transitionTypes={TO_AUTH}
            className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-bold text-[#2a0512] transition-all duration-150 hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 sm:px-5"
          >
            Join Now
          </Link>
        </div>
      </div>
      {/* On a phone the page links sit in their own small bar under the main one. */}
      <div className="mt-2 flex justify-center md:hidden">
        {links("no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/12 bg-[rgb(14_3_8/0.6)] p-1 backdrop-blur-2xl max-[399px]:[&_a]:px-2.5")}
      </div>
    </header>
  );
}
