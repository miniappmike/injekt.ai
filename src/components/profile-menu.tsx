"use client";

import Link from "next/link";
import { ProBadge } from "@/components/pro-badge";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useApp } from "@/components/app-context";
import { toggleGeneration } from "@/app/(app)/settings/api-keys/actions";
import { cn } from "@/lib/utils";
import { GET_KEY_PATH } from "@/lib/links";
import { INVITE_PATH, INVITE_REWARD_TOKENS } from "@/lib/invites";
import { Gift } from "lucide-react";

const item =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none";

// Your profile in the header. Hover it to open the menu; on a touch screen or with the keyboard, tap or press it instead.
export function ProfileMenu({ email, admin = false }: { email: string; admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const router = useRouter();
  const { generation, imageKey, pro } = useApp();
  // The switch shows the new state at once and goes back if the server says no.
  const [genOn, setGenOn] = useState(generation);
  const [genNote, setGenNote] = useState<string>();
  const [, startToggle] = useTransition();
  useEffect(() => setGenOn(generation), [generation]);

  // One click flips image generation (images are paid with tokens, or on Pro with their own key).
  function flipGeneration() {
    const before = genOn;
    setGenOn(!before);
    setGenNote(undefined);
    startToggle(async () => {
      const r = await toggleGeneration();
      if (r.ok) {
        setGenOn(r.enabled);
        router.refresh();
      } else if (r.settings) {
        setGenOn(before);
        setOpen(false);
        router.push("/settings/api-keys");
      } else {
        setGenOn(before);
        setGenNote(r.error);
      }
    });
  }

  // Tapping or clicking anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = () => setOpen(false);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && open) {
      close();
      button.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const wasOpen = open;
    setOpen(true);
    // The menu may have only just opened, so look for its items once it is drawn.
    requestAnimationFrame(() => {
      const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]') ?? [])];
      if (!items.length) return;
      const at = wasOpen ? items.indexOf(document.activeElement as HTMLElement) : -1;
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? items.length - 1
        : e.key === "ArrowDown" ? (at + 1) % items.length
        : (at <= 0 ? items.length : at) - 1;
      items[next].focus();
    });
  }

  return (
    <div
      ref={root}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={onKeyDown}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Your profile"
        // A mouse click keeps it open (hover already opened it); a tap or the keyboard toggles it.
        onClick={(e) => setOpen((was) => ((e.nativeEvent as PointerEvent).pointerType === "mouse" ? true : !was))}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-300 max-sm:h-10 max-sm:w-10 max-sm:justify-center max-sm:rounded-xl max-sm:border max-sm:border-neutral-800 max-sm:bg-neutral-900 max-sm:px-0 transition-colors hover:bg-neutral-800 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 text-xs font-bold uppercase text-white ring-2 ring-neutral-950 shadow-[0_0_0_3px_rgb(232_38_94/0.35)]">
          {email.charAt(0) || "?"}
        </span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{email}</span>
        <span aria-hidden="true" className="text-xs text-neutral-500 max-sm:hidden">▾</span>
      </button>

      {/* The wrapper reaches up to the button with no gap, so moving the mouse down onto the menu doesn't close it. */}
      {open && (
        <div id={menuId} className="absolute right-0 top-full z-30 pt-1 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
          {/* Focusable so that clicking its non-link parts keeps focus inside, which would otherwise close the menu. */}
          <div tabIndex={-1} className="w-72 max-w-[calc(100vw-2rem)] origin-top animate-pop-in max-sm:origin-top-right rounded-xl border border-neutral-800 bg-neutral-900/95 p-1.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.9)] backdrop-blur-xl focus:outline-none">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <p className="min-w-0 truncate text-xs text-neutral-500" title={email}>Signed in as {email}</p>
              {/* Free accounts: the way to the Pro page. Pro accounts just see their badge. */}
              {pro ? (
                <ProBadge className="shrink-0" />
              ) : (
                <Link
                  href="/upgrade"
                  onClick={close}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-[#ff5fa2] to-[#f92776] py-1 pl-1.5 pr-2.5 text-xs font-bold text-white shadow-[0_6px_16px_-6px_rgb(249_39_118/0.8)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  {/* On the pink badge the sparkle is drawn in the page's background colour. */}
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-neutral-950">
                    <path d="M8 1c.5 3.3 2.2 5 5.5 5.5C10.2 7 8.5 8.7 8 12c-.5-3.3-2.2-5-5.5-5.5C5.8 6 7.5 4.3 8 1Z" />
                  </svg>
                  Upgrade
                </Link>
              )}
            </div>
            {genNote && <p role="alert" className="px-3 pb-1 text-xs text-red-400">{genNote}</p>}
            <div role="menu" aria-label="Profile">
              {/* Image generation: shows whether it's on and flips it in one click. */}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={genOn}
                onClick={flipGeneration}
                className={cn(item, "flex items-center justify-between gap-3")}
              >
                <span className="min-w-0">
                  <span className="block">Image generation</span>
                  <span className={cn("block text-xs", genOn ? "text-emerald-300" : "text-neutral-500")}>
                    {genOn ? "On" : "Off"}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200", genOn ? "border-emerald-400/60 bg-emerald-500/30" : "border-neutral-700 bg-neutral-800")}
                >
                  <span className={cn("absolute h-[18px] w-[18px] rounded-full shadow transition-all duration-200", genOn ? "left-[22px] bg-emerald-300" : "left-[3px] bg-neutral-400")} />
                </span>
              </button>
              <div role="separator" className="my-1 border-t border-neutral-800" />
              <Link href="/tokens" role="menuitem" onClick={close} className={item}>Tokens</Link>
              <Link href={INVITE_PATH} role="menuitem" onClick={close} className={cn(item, "flex items-center justify-between gap-3 bg-iris-500/10 text-indigo-100 hover:bg-iris-500/20")}>
                <span className="flex items-center gap-2">
                  <Gift aria-hidden="true" className="h-4 w-4" />
                  Invite friends
                </span>
                {INVITE_REWARD_TOKENS && (
                  <span className="rounded-full border border-iris-400/50 bg-iris-500/30 px-2 text-xs font-semibold">+{INVITE_REWARD_TOKENS}</span>
                )}
              </Link>
              <Link href="/ledger" role="menuitem" onClick={close} className={item}>Ledger</Link>
              <Link href="/settings/api-keys" role="menuitem" onClick={close} className={item}>Settings</Link>
              {/* Only until they have a key; after that the guide stays in the footer. */}
              {pro && !imageKey && <Link href={GET_KEY_PATH} role="menuitem" onClick={close} className={item}>Get an API key</Link>}
              {admin && <Link href="/admin" role="menuitem" onClick={close} className={item}>Admin</Link>}
              <form action="/auth/signout" method="post" className="mt-1 border-t border-neutral-800 pt-1">
                <button type="submit" role="menuitem" className={item}>Log out</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
