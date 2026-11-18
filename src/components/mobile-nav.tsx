"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Brush, ChevronRight, Coins, Gift, Images, KeyRound, LayoutDashboard, Package2, ReceiptText, Settings, Sparkles } from "lucide-react";
import { useApp } from "@/components/app-context";
import { useSheetDrag } from "@/lib/sheet-drag";
import { CONTACT_EMAIL, DISCORD_URL, GET_KEY_PATH } from "@/lib/links";
import { INVITE_PATH } from "@/lib/invites";
import { BackIcon, CharactersIcon, CreateModelIcon, GridIcon, GroupIcon, InjectIcon, LikenessIcon, SparkIcon, StoreIcon, VariantsIcon } from "@/components/icons";
import { DOCK_MORE, DOCK_NAV } from "@/lib/nav";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/home": LayoutDashboard,
  "/characters": CharactersIcon,
  "/inject": InjectIcon,
  "/director": SparkIcon,
  "/variants": VariantsIcon,
  "/library": Images,
  "/likeness": LikenessIcon,
  "/reference-sheet": CreateModelIcon,
  "/marketplace": StoreIcon,
  "/art-to-real": Brush,
  "/ugc": Package2,
  "/director#group": GroupIcon,
};
/** The tool tiles in the More sheet: the rest of the menu, plus Group photo (Director with characters added). */
const SHEET_TOOLS = [...DOCK_MORE, { href: "/director#group", label: "Group photo" }];
/** The account pages, listed under the tools in the More sheet (on a computer they are in the footer and profile menu). */
const ACCOUNT: { href: string; label: string; Icon: React.ComponentType<{ className?: string }>; freeOnly?: boolean }[] = [
  { href: "/tokens", label: "Tokens", Icon: Coins },
  { href: "/upgrade", label: "Upgrade to Pro", Icon: Sparkles, freeOnly: true },
  { href: INVITE_PATH, label: "Invite friends", Icon: Gift },
  { href: "/ledger", label: "Ledger", Icon: ReceiptText },
  { href: "/settings/api-keys", label: "Settings", Icon: Settings },
  { href: GET_KEY_PATH, label: "API key guide", Icon: KeyRound },
];
/** A page under More: its path matches a tool or an account page there. */
const inMore = (path: string) => [...DOCK_MORE, ...ACCOUNT].some((m) => !m.href.includes("#") && path.startsWith(m.href));

const TITLES: [RegExp, string][] = [
  [/^\/home/, "Home"],
  [/^\/marketplace/, "Marketplace"],
  [/^\/characters\/new/, "New character"],
  [/^\/characters\/./, "Character"],
  [/^\/characters/, "Characters"],
  [/^\/inject/, "Inject"],
  [/^\/director/, "Director"],
  [/^\/variants/, "Variants"],
  [/^\/library/, "Library"],
  [/^\/likeness/, "Likeness"],
  [/^\/reference-sheet/, "Create Model"],
  [/^\/art-to-real/, "Art to Real"],
  [/^\/ugc/, "UGC"],
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
          onClick={() => (history.length > 1 ? router.back() : router.push("/home"))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-200 transition-transform active:scale-95"
        >
          <BackIcon />
        </button>
      ) : (
        <Link href="/home" aria-label="ModelSpawn home" className="-ml-1 flex h-10 w-9 shrink-0 items-center justify-center max-[379px]:hidden">
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
  const { pro } = useApp();
  const [typing, setTyping] = useState(false);
  const [more, setMore] = useState(false);
  const drag = useSheetDrag(() => setMore(false));
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
            style={drag.style}
            className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-var(--safe-top)-3.5rem)] animate-sheet-up overflow-y-auto overscroll-contain rounded-t-[1.75rem] border-t border-neutral-700/70 bg-neutral-900 px-4 pb-[calc(var(--dock-clear)+0.75rem)] shadow-[0_-24px_60px_-20px_rgb(0_0_0/0.9)]"
          >
            {/* The grab bar: pull it down to close the sheet. */}
            <div {...drag.handle} aria-hidden="true" className="-mx-4 flex cursor-grab justify-center pb-3 pt-2.5">
              <span className="h-1 w-10 rounded-full bg-neutral-700" />
            </div>
            <p className="mb-3 font-display text-base font-bold text-neutral-50">All tools</p>
            <div className="grid grid-cols-3 gap-2.5">
              {SHEET_TOOLS.map(({ href, label }) => {
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
            {/* Everything the page footer lists on a computer, as one list: on a phone the footer is two lines. */}
            <p className="mb-2 mt-5 font-display text-base font-bold text-neutral-50">Account</p>
            <ul className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-800/40">
              {ACCOUNT.filter((a) => !(a.freeOnly && pro)).map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link href={href} onClick={() => setMore(false)} className="flex min-h-12 items-center gap-3 px-3.5 text-[15px] font-medium text-neutral-100 active:bg-neutral-800">
                    <Icon className="h-5 w-5 shrink-0 text-brand-300" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-500" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-neutral-400">
              <Link href="/terms" className="py-1.5">Terms</Link>
              <Link href="/privacy" className="py-1.5">Privacy</Link>
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="py-1.5">Discord</a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="py-1.5">Contact</a>
            </p>
          </div>
        </div>
      )}
      <nav
        aria-label="Tools"
        className={cn(
          "fixed inset-x-0 bottom-[var(--dock-bottom)] z-20 flex justify-center px-3 transition-all duration-300 sm:hidden [.sheet-open_&]:pointer-events-none [.sheet-open_&]:translate-y-24 [.sheet-open_&]:opacity-0",
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
      {DOCK_NAV.map(({ href, label, short }) => {
        const Icon = ICONS[href];
        const on = !more && path.startsWith(href);
        return (
          <Link key={href} href={href} title={label} aria-current={on ? "page" : undefined} className={cn(SLOT, on ? "bg-brand-500/15 text-white" : "text-neutral-400 hover:text-neutral-100")}>
            <Icon className={cn("h-[22px] w-[22px] shrink-0", on && "text-brand-300")} />
            <span className="max-w-full truncate">{short}</span>
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
