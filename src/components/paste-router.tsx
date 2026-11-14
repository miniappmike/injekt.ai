"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { takeStashedFiles } from "@/lib/handoff";

/**
 * Ctrl+V for images, page-wide. Every image box registers with `usePasteTarget`. A paste while a box is focused goes
 * to that box through its own onPaste, as before. A paste anywhere else (nothing focused, or a button or the page) goes
 * to the box nearest the mouse, or the one nearest the middle of the screen if the mouse hasn't moved yet. That box
 * then takes focus, so the next paste goes to it too. Pasting into a text field is left alone. While a dialog is open,
 * only its boxes count.
 */
const ATTR = "data-paste-target";
const EVENT = "app:paste-files";

/** The image files in a paste, from its files or its items (some sources only fill in one of them). */
export function clipboardImages(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (files.length) return files;
  return Array.from(dt.items ?? [])
    .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
}

/** Registers an element as an image box for pastes that land outside every box. */
export function usePasteTarget(ref: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void, disabled = false) {
  const handler = useRef(onFiles);
  handler.current = onFiles;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute(ATTR, disabled ? "off" : "on");
    const on = (e: Event) => handler.current((e as CustomEvent<File[]>).detail);
    el.addEventListener(EVENT, on);
    return () => {
      el.removeAttribute(ATTR);
      el.removeEventListener(EVENT, on);
    };
  }, [ref, disabled]);
}

/** The distance from a point to a rectangle (0 inside it). */
const distance = (x: number, y: number, r: DOMRect) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));

export function nearestTarget(targets: HTMLElement[], x: number, y: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const d = distance(x, y, r);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}

/** Mounted once in the app layout. */
export function PasteRouter() {
  const pathname = usePathname();
  // Photos handed over from the page before (the dashboard's drop zone): give them to this page's first image box,
  // waiting a moment for it to appear.
  useEffect(() => {
    const files = takeStashedFiles();
    if (!files.length) return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[${ATTR}="on"]`);
      if (el) el.dispatchEvent(new CustomEvent(EVENT, { detail: files }));
      if (el || ++tries > 40) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [pathname]);
  useEffect(() => {
    let mouse: { x: number; y: number } | null = null;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") mouse = { x: e.clientX, y: e.clientY };
    };
    const paste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      // Typing somewhere, or already inside a box (its own onPaste takes it).
      if (t?.closest(`input, textarea, select, [contenteditable=""], [contenteditable="true"], [${ATTR}]`)) return;
      const files = clipboardImages(e.clipboardData);
      if (!files.length) return;
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
      const scope: ParentNode = dialogs.at(-1) ?? document;
      const targets = Array.from(scope.querySelectorAll<HTMLElement>(`[${ATTR}="on"]`));
      const p = mouse ?? { x: innerWidth / 2, y: innerHeight / 2 };
      const el = nearestTarget(targets, p.x, p.y);
      if (!el) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      el.dispatchEvent(new CustomEvent(EVENT, { detail: files }));
    };
    addEventListener("pointermove", move, { passive: true });
    document.addEventListener("paste", paste);
    return () => {
      removeEventListener("pointermove", move);
      document.removeEventListener("paste", paste);
    };
  }, []);
  return null;
}
