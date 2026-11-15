"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MenuOption {
  value: string;
  label: string;
}
export interface MenuGroup {
  /** A small heading above the group; leave out for a plain group. */
  label?: string;
  options: MenuOption[];
}

/**
 * An on-brand dropdown for choices that come in groups (the browser's own menu can't be styled). Same look and
 * keyboard as the character picker: Enter, Space or the arrows open it; arrows move, Enter picks, Esc closes.
 */
export function MenuSelect({ id, value, onChange, groups, disabled }: { id: string; value: string; onChange: (value: string) => void; groups: MenuGroup[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const flat = groups.flatMap((g) => g.options);
  const chosen = flat.find((o) => o.value === value) ?? flat[0];

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
    setActive(Math.max(0, flat.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = flat[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(id)}`)?.focus();
  };

  let index = -1;
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
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(flat.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Tab") setOpen(false);
        }}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-left text-sm transition-[border-color,box-shadow] duration-150 hover:border-neutral-600 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/25 disabled:opacity-50",
          open && "border-brand-500 ring-3 ring-brand-500/25",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-neutral-50">{chosen?.label}</span>
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
          className="absolute left-0 top-full z-30 mt-2 max-h-[18rem] w-full min-w-[12rem] origin-top animate-pop-in overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/95 p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.95)] backdrop-blur-xl"
        >
          {groups.map((g, gi) => (
            <li key={g.label ?? gi} role="presentation" className={cn(gi > 0 && "mt-1 border-t border-neutral-800/80 pt-1")}>
              {g.label && <span className="block px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{g.label}</span>}
              <ul role="group" aria-label={g.label}>
                {g.options.map((o) => {
                  const i = ++index;
                  const selected = o.value === value;
                  return (
                    <li
                      key={o.value || "none"}
                      id={`${listId}-${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={selected}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => choose(i)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors duration-100",
                        selected ? "border-brand-500/60 bg-brand-500/15 font-semibold text-neutral-50" : "border-transparent text-neutral-200",
                        i === active && !selected && "border-neutral-700 bg-neutral-800",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {selected && (
                        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 fill-none stroke-brand-400" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
