"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PickerCharacter {
  id: string;
  name: string;
  /** Her picture (profile photo, else a reference); her initial is shown without one. */
  photo?: string | null;
  /** A short note under the name, e.g. "no images yet". */
  note?: string;
}

function Avatar({ c, size = "h-9 w-9" }: { c: { name: string; photo?: string | null }; size?: string }) {
  return c.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.photo} alt="" className={cn(size, "shrink-0 rounded-full object-cover object-top ring-2 ring-neutral-950")} />
  ) : (
    <span aria-hidden="true" className={cn(size, "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 font-display text-sm font-bold text-white ring-2 ring-neutral-950")}>
      {c.name.charAt(0) || "?"}
    </span>
  );
}

/**
 * A visual character menu: the chosen character with her picture, opening a grid of cards to pick from. `none` adds a
 * "no character" card first (value ""). Keyboard: Enter, Space or the arrows open it; arrows move, Enter picks, Esc closes.
 */
export function CharacterPicker({
  id,
  value,
  onChange,
  characters,
  none,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  characters: PickerCharacter[];
  none?: { label: string; note?: string };
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const options: (PickerCharacter & { none?: boolean })[] = [...(none ? [{ id: "", name: none.label, note: none.note, none: true }] : []), ...characters];
  const chosen = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.id);
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(id)}`)?.focus();
  };

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
              e.preventDefault();
              show();
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Tab") setOpen(false);
        }}
        className={cn(
          "group flex h-12 w-full items-center gap-3 rounded-xl border border-neutral-700/80 bg-neutral-950/60 pl-1.5 pr-3 text-left text-sm transition-[border-color,box-shadow] duration-150 hover:border-neutral-600 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/25 disabled:opacity-50",
          open && "border-brand-500 ring-3 ring-brand-500/25",
        )}
      >
        {chosen?.none ? (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-600 text-neutral-500">∅</span>
        ) : (
          chosen && <Avatar c={chosen} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-neutral-50">{chosen?.name ?? "No characters"}</span>
          {chosen?.note && <span className="block truncate text-xs text-neutral-500">{chosen.note}</span>}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("h-4 w-4 shrink-0 fill-none stroke-neutral-400 transition-transform duration-200", open && "rotate-180")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 top-full z-30 mt-2 grid max-h-[22rem] w-full sm:w-[min(30rem,calc(100vw-2rem))] sm:min-w-full origin-top-left animate-pop-in grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/95 p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.95)] backdrop-blur-xl sm:grid-cols-2"
        >
          {options.map((o, i) => {
            const selected = o.id === value;
            return (
              <li
                key={o.id || "none"}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors duration-100",
                  selected ? "border-brand-500/60 bg-brand-500/15" : "border-transparent",
                  i === active && !selected && "border-neutral-700 bg-neutral-800",
                )}
              >
                {o.none ? (
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-600 text-neutral-500">∅</span>
                ) : (
                  <Avatar c={o} size="h-11 w-11" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-50">{o.name}</span>
                  {o.note && <span className="block truncate text-xs text-neutral-500">{o.note}</span>}
                </span>
                {selected && (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-none stroke-brand-400" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
