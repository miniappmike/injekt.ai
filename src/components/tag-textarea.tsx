"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const TAG = /(@image\s?\d{1,2})/gi;

/** The "@..." being typed right before the cursor: "@", "@im", "@image", "@image2". */
const TYPING = /(?:^|\s)(@(?:i(?:m(?:a(?:g(?:e)?)?)?)?)?\s?(\d{0,2}))$/i;

/** An image that can be tagged: its thumbnail for the @ menu. */
export interface TagRef {
  thumb?: string;
}

/**
 * A textarea whose "@image N" tags light up as you type (ModelSpawn pink chips), with a row of tag chips under it that
 * insert the tag at the cursor. The highlight is a mirror layer behind transparent text, so typing stays a real textarea.
 * With `refs`, typing @ opens a menu of those images (thumbnail and tag) and the chips are one per image; with none,
 * neither shows.
 */
export function TagTextarea({
  id,
  value,
  onChange,
  tags,
  rows = 4,
  maxLength,
  placeholder,
  refs,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** How many @image tags exist (1..tags). Tags above this show as unknown (grey). */
  tags: number;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  /** The images that can be tagged, in @image order. Given: chips and the @ menu list exactly these. */
  refs?: TagRef[];
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  // Where the cursor goes after a tag is put in: set as soon as the new text is in the box, before the next key press.
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (el && caret.current != null) {
      el.focus();
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);
  const pickable = refs ? refs.length : tags;
  // The open @ menu: where the typed "@..." starts, the number typed so far, and the highlighted row.
  const [menu, setMenu] = useState<{ start: number; end: number; num: string; active: number } | null>(null);
  const options = menu && refs ? refs.map((r, i) => ({ ...r, n: i + 1 })).filter((o) => !menu.num || String(o.n).startsWith(menu.num)) : [];
  const readMenu = (text: string, caret: number) => {
    if (!refs?.length) return setMenu(null);
    const m = TYPING.exec(text.slice(0, caret));
    if (!m) return setMenu(null);
    setMenu((old) => ({ start: caret - m[1].length, end: caret, num: m[2], active: old && old.start === caret - m[1].length ? old.active : 0 }));
  };
  const choose = (n: number) => {
    if (!menu) return;
    const tag = `@image${n} `;
    const after = value.slice(menu.end).replace(/^ /, "");
    const next = (value.slice(0, menu.start) + tag + after).slice(0, maxLength);
    const at = menu.start + tag.length;
    setMenu(null);
    caret.current = at;
    onChange(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menu || !options.length) return;
    const move = (d: number) => setMenu({ ...menu, active: (menu.active + d + options.length) % options.length });
    if (e.key === "ArrowDown") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
    else if (e.key === "Enter" || e.key === "Tab") (e.preventDefault(), choose(options[Math.min(menu.active, options.length - 1)].n));
    else if (e.key === "Escape") (e.preventDefault(), setMenu(null));
  };
  // Phones: globals.css makes every textarea 16px (so iPhones don't zoom in on tap); the highlight layer must match it,
  // or the words shown and the real text (with the cursor) wrap at different places.
  const box = "w-full whitespace-pre-wrap break-words px-3 py-2 text-sm leading-6 max-sm:text-base max-sm:leading-6";
  const insert = (tag: string) => {
    const el = ta.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    const before = value.slice(0, at);
    const add = `${before && !/\s$/.test(before) ? " " : ""}${tag} `;
    const next = (before + add + value.slice(end)).slice(0, maxLength);
    caret.current = at + add.length;
    onChange(next);
  };
  return (
    <div>
      <div className="relative rounded-lg border border-neutral-700/80 bg-neutral-950/60 transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/25 hover:border-neutral-600">
        <div ref={mirror} aria-hidden="true" className={cn(box, "pointer-events-none absolute inset-0 overflow-hidden text-neutral-100")}>
          {value.split(TAG).map((part, i) => {
            if (i % 2 === 0) return <span key={i}>{part}</span>;
            const n = Number(part.replace(/\D/g, ""));
            const known = n >= 1 && n <= tags;
            return (
              <span key={i} className={known ? "rounded-md bg-brand-500/25 text-brand-300 ring-1 ring-brand-500/50" : "rounded-md bg-neutral-700/50 text-neutral-400"}>
                {part}
              </span>
            );
          })}
          {"\n"}
        </div>
        <textarea
          ref={ta}
          id={id}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            readMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onClick={(e) => readMenu(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          role={refs ? "combobox" : undefined}
          aria-expanded={refs ? !!(menu && options.length) : undefined}
          aria-autocomplete={refs ? "list" : undefined}
          onScroll={(e) => mirror.current && (mirror.current.scrollTop = e.currentTarget.scrollTop)}
          className={cn(box, "relative block resize-y bg-transparent text-transparent caret-neutral-100 placeholder:text-neutral-500 focus:outline-none selection:bg-brand-500/30")}
        />
      </div>
      {menu && options.length > 0 && (
        <div className="relative">
          <ul role="listbox" aria-label="Images to tag" className="absolute left-0 top-1 z-30 w-56 overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900 p-1 shadow-xl shadow-black/40">
            {options.map((o, i) => (
              <li key={o.n} role="option" aria-selected={i === menu.active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setMenu({ ...menu, active: i })}
                  onClick={() => choose(o.n)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left font-mono text-sm text-neutral-100", i === menu.active ? "bg-neutral-700/70" : "hover:bg-neutral-800")}
                >
                  {o.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.thumb} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-white/10" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-md bg-neutral-800 ring-1 ring-white/10" />
                  )}
                  @image {o.n}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pickable > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          Type @ to reference:
          {Array.from({ length: pickable }, (_, i) => `@image${i + 1}`).map((t) => (
            <button key={t} type="button" onClick={() => insert(t)} className="rounded-md bg-brand-500/20 px-1.5 py-0.5 font-mono text-brand-300 ring-1 ring-brand-500/40 hover:bg-brand-500/30">
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
