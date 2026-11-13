"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/inject", label: "Inject" },
  { href: "/director", label: "Director" },
  { href: "/variants", label: "Variants" },
  { href: "/likeness", label: "Likeness" },
  { href: "/reference-sheet", label: "Create Model" },
  { href: "/characters", label: "Characters" },
  { href: "/marketplace", label: "Marketplace" },
];

export function MainNav() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways: keep the open one in view.
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav
      ref={nav}
      className="-mb-px flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]"
    >
      {TABS.map((t) => {
        const on = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "group relative rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap text-neutral-400 transition-colors duration-150 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
              on && "text-neutral-50",
            )}
          >
            {t.label}
            {/* The crimson bar under the open tab; it grows in from the middle on hover for the others. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-brand-500 transition-transform duration-200",
                on ? "scale-x-100 shadow-[0_0_12px_rgb(232_38_94/0.8)]" : "scale-x-0 bg-neutral-500 group-hover:scale-x-100",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
