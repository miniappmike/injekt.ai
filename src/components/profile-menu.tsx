"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const item =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none";

// Your profile in the header. Hover it to open the menu; on a touch screen or with the keyboard, tap or press it instead.
export function ProfileMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

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
      const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
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
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
      >
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold uppercase text-neutral-100">
          {email.charAt(0) || "?"}
        </span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{email}</span>
        <span aria-hidden="true" className="text-xs text-neutral-500">▾</span>
      </button>

      {/* The wrapper reaches up to the button with no gap, so moving the mouse down onto the menu doesn't close it. */}
      {open && (
        <div id={menuId} className="absolute right-0 top-full z-30 pt-1">
          {/* Focusable so that clicking its non-link parts keeps focus inside, which would otherwise close the menu. */}
          <div tabIndex={-1} className="min-w-52 rounded-lg border border-neutral-800 bg-neutral-900 p-1 shadow-xl focus:outline-none">
            <p className="truncate px-3 py-2 text-xs text-neutral-500" title={email}>Signed in as {email}</p>
            <div role="menu" aria-label="Profile">
              <Link href="/ledger" role="menuitem" onClick={close} className={item}>Ledger</Link>
              <Link href="/settings/api-keys" role="menuitem" onClick={close} className={item}>API keys</Link>
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
