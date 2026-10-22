"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/inject", label: "Inject" },
  { href: "/variants", label: "Variants" },
  { href: "/likeness", label: "Likeness" },
  { href: "/reference-sheet", label: "Reference Sheet" },
  { href: "/characters", label: "Characters" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-neutral-400 hover:text-neutral-100",
            pathname.startsWith(t.href) && "bg-neutral-800 text-neutral-100",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
