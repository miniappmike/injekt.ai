"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { BackIcon, CharactersIcon, InjectIcon, LikenessIcon, SheetIcon, VariantsIcon } from "@/components/icons";

const DOCK = [
  { href: "/inject", label: "Inject", Icon: InjectIcon },
  { href: "/variants", label: "Variants", Icon: VariantsIcon },
  { href: "/likeness", label: "Likeness", Icon: LikenessIcon },
  { href: "/reference-sheet", label: "Sheets", Icon: SheetIcon },
  { href: "/characters", label: "Characters", Icon: CharactersIcon },
];

const TITLES: [RegExp, string][] = [
  [/^\/characters\/new/, "New character"],
  [/^\/characters\/./, "Character"],
  [/^\/characters/, "Characters"],
  [/^\/inject/, "Inject"],
  [/^\/variants/, "Variants"],
  [/^\/likeness/, "Likeness"],
  [/^\/reference-sheet/, "Reference Sheet"],
  [/^\/settings/, "Settings"],
  [/^\/ledger/, "Ledger"],
  [/^\/admin/, "Admin"],
];

/**
 * The left half of the phone top bar: the mark (or a back arrow on a page inside a section), and the page's name in
 * the middle, so the big page title can be left off on small screens.
 */
export function MobileTitle() {
  const path = usePathname();
  const router = useRouter();
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "";
  const inner = path.split("/").filter(Boolean).length > 1;
  return (
    <>
      {inner ? (
        <button
          type="button"
          aria-label="Back"
          onClick={() => (history.length > 1 ? router.back() : router.push("/characters"))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-200 transition-transform active:scale-95"
        >
          <BackIcon />
        </button>
      ) : (
        <Link href="/characters" aria-label="Model Spawn home" className="-ml-1 flex h-10 w-9 shrink-0 items-center justify-center">
          <Logo withName={false} />
        </Link>
      )}
      <span className="min-w-0 flex-1 truncate font-display text-[19px] font-bold tracking-tight text-neutral-50">{title}</span>
    </>
  );
}

/**
 * The floating pill along the bottom of the screen on phones: one round button per tool, the open one filled and
 * showing its name. It steps aside while the keyboard is up, so it never covers what you're typing.
 */
export function MobileDock() {
  const path = usePathname();
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select") || t.isContentEditable);
    const on = (e: FocusEvent) => setTyping(isField(e.target));
    const off = () => setTyping(false);
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
    };
  }, []);
  return (
    <nav
      aria-label="Tools"
      className={cn(
        "fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4 transition-all duration-300 sm:hidden [.sheet-open_&]:pointer-events-none [.sheet-open_&]:translate-y-24 [.sheet-open_&]:opacity-0",
        typing && "pointer-events-none translate-y-24 opacity-0",
      )}
    >
      <div className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/90 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl">
        {DOCK.map(({ href, label, Icon }) => {
          const on = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-full text-neutral-400 transition-all duration-300 active:scale-95",
                on ? "glow-brand bg-brand-500 px-4 text-white" : "w-11 hover:bg-neutral-800 hover:text-neutral-100",
              )}
            >
              <Icon className="h-[22px] w-[22px] shrink-0" />
              {on && <span className="animate-fade-in text-[13px] font-semibold">{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
