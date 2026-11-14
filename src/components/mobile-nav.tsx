"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Brush } from "lucide-react";
import { BackIcon, CharactersIcon, CreateModelIcon, GridIcon, GroupIcon, InjectIcon, LikenessIcon, SparkIcon, StoreIcon, VariantsIcon } from "@/components/icons";
import { DOCK_MORE, DOCK_NAV } from "@/lib/nav";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/characters": CharactersIcon,
  "/inject": InjectIcon,
  "/director": SparkIcon,
  "/variants": VariantsIcon,
  "/likeness": LikenessIcon,
  "/reference-sheet": CreateModelIcon,
  "/marketplace": StoreIcon,
  "/art-to-real": Brush,
  "/characters#group": GroupIcon,
};
/** A page under More: its path matches and it isn't one of the four dock tabs. */
const inMore = (path: string) => DOCK_MORE.some((m) => !m.href.includes("#") && path.startsWith(m.href));

const TITLES: [RegExp, string][] = [
  [/^\/marketplace/, "Marketplace"],
  [/^\/characters\/new/, "New character"],
  [/^\/characters\/./, "Character"],
  [/^\/characters/, "Characters"],
  [/^\/inject/, "Inject"],
  [/^\/director/, "Director"],
  [/^\/variants/, "Variants"],
  [/^\/likeness/, "Likeness"],
  [/^\/reference-sheet/, "Create Model"],
  [/^\/art-to-real/, "Art to Real"],
  [/^\/tokens/, "Tokens"],
  [/^\/upgrade/, "Upgrade to Pro"],
  [/^\/get-a-key/, "API key guide"],
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
        <Link href="/characters" aria-label="ModelSpawn home" className="-ml-1 flex h-10 w-9 shrink-0 items-center justify-center max-[379px]:hidden">
          <Logo withName={false} small />
        </Link>
      )}
      <span className="min-w-0 flex-1 truncate font-display text-[17px] font-bold tracking-tight text-neutral-50">{title}</span>
    </>
  );
}

/**
 * The bar along the bottom of the screen on phones: four everyday tabs, each with its name, and More, which slides up
 * a sheet with the rest. It steps aside while the keyboard is up, so it never covers what you're typing.
 */
export function MobileDock() {
  const path = usePathname();
  const [typing, setTyping] = useState(false);
  const [more, setMore] = useState(false);
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
  // Going anywhere closes the sheet, and so does Escape.
  useEffect(() => setMore(false), [path]);
  useEffect(() => {
    if (!more) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [more]);
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-20 sm:hidden">
          <button type="button" aria-label="Close the menu" onClick={() => setMore(false)} className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-[2px]" />
          <div
            id="dock-more"
            role="dialog"
            aria-modal="true"
            aria-label="All tools"
            className="absolute inset-x-0 bottom-0 animate-sheet-up rounded-t-[1.75rem] border-t border-neutral-700/70 bg-neutral-900 px-4 pt-2.5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] shadow-[0_-24px_60px_-20px_rgb(0_0_0/0.9)]"
          >
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-neutral-700" />
            <p className="mb-3 font-display text-base font-bold text-neutral-50">All tools</p>
            <div className="grid grid-cols-3 gap-2.5">
              {DOCK_MORE.map(({ href, label }) => {
                const Icon = ICONS[href];
                const on = !href.includes("#") && path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMore(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-3 text-center text-[13px] font-semibold leading-tight transition-transform active:scale-95",
                      on ? "border-brand-500/50 bg-brand-500/15 text-white" : "border-neutral-800 bg-neutral-800/60 text-neutral-100",
                    )}
                  >
                    <Icon className="h-6 w-6 shrink-0 text-brand-300" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <nav
        aria-label="Tools"
        className={cn(
          "fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3 transition-all duration-300 sm:hidden [.sheet-open_&]:pointer-events-none [.sheet-open_&]:translate-y-24 [.sheet-open_&]:opacity-0",
          typing && "pointer-events-none translate-y-24 opacity-0",
        )}
      >
        <DockBar path={path} more={more} onMore={() => setMore((m) => !m)} />
      </nav>
    </>
  );
}

const SLOT = "flex h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[10.5px] font-semibold leading-none transition-all duration-200 active:scale-95";

/** The dock's tabs: the one for `path` lit, and More lit while its sheet is up or you're on one of its pages. */
export function DockBar({ path, more = false, onMore }: { path: string; more?: boolean; onMore?: () => void }) {
  const moreOn = more || inMore(path);
  return (
    <div className="flex w-full max-w-md items-center gap-1 rounded-[1.4rem] border border-neutral-800 bg-neutral-900/90 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl">
      {DOCK_NAV.map(({ href, label }) => {
        const Icon = ICONS[href];
        const on = !more && path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn(SLOT, on ? "bg-brand-500/15 text-white" : "text-neutral-400 hover:text-neutral-100")}>
            <Icon className={cn("h-[22px] w-[22px] shrink-0", on && "text-brand-300")} />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} aria-haspopup="dialog" aria-expanded={more} aria-controls="dock-more" className={cn(SLOT, moreOn ? "bg-brand-500/15 text-white" : "text-neutral-400 hover:text-neutral-100")}>
        <GridIcon className={cn("h-[22px] w-[22px] shrink-0", moreOn && "text-brand-300")} />
        More
      </button>
    </div>
  );
}
