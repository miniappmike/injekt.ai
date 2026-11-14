"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Brush } from "lucide-react";
import { LikenessIcon, GroupIcon, ChevronIcon } from "@/components/icons";
import { MORE_NAV, NAV as TABS } from "@/lib/nav";

export function MainNav() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways: keep the open one in view.
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <div className="flex min-w-0 items-center gap-1">
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
    <MoreMenu pathname={pathname} />
    </div>
  );
}

const MORE_ICONS = { "/likeness": LikenessIcon, "/art-to-real": Brush, "/characters#group": GroupIcon } as const;

/** The tools that have no tab of their own. It sits outside the scrolling row of tabs so the menu isn't clipped. */
function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const on = MORE_NAV.some((m) => !m.href.includes("#") && pathname.startsWith(m.href));
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group relative flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap text-neutral-400 transition-colors duration-150 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
          (on || open) && "text-neutral-50",
        )}
      >
        More
        <ChevronIcon className={cn("h-3.5 w-3.5 rotate-90 transition-transform duration-200", open && "-rotate-90")} />
        <span aria-hidden="true" className={cn("absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-brand-500 transition-transform duration-200", on ? "scale-x-100 shadow-[0_0_12px_rgb(232_38_94/0.8)]" : "scale-x-0")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-72 origin-top-right animate-pop-in rounded-xl border border-neutral-800 bg-neutral-900/95 p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.95)] backdrop-blur-xl">
          {MORE_NAV.map((m) => {
            const Icon = MORE_ICONS[m.href];
            return (
              <Link key={m.href} href={m.href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-50">{m.label}</span>
                  <span className="block truncate text-xs text-neutral-400">{m.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
