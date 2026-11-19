"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

const TAG = /(@image\s?\d{1,2})/gi;

/**
 * A textarea whose "@image N" tags light up as you type (ModelSpawn pink chips), with a row of tag chips under it that
 * insert the tag at the cursor. The highlight is a mirror layer behind transparent text, so typing stays a real textarea.
 */
export function TagTextarea({
  id,
  value,
  onChange,
  tags,
  rows = 4,
  maxLength,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** How many @image tags exist (1..tags). Tags above this show as unknown (grey). */
  tags: number;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const box = "w-full whitespace-pre-wrap break-words px-3 py-2 text-sm leading-6";
  const insert = (tag: string) => {
    const el = ta.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    const before = value.slice(0, at);
    const add = `${before && !/\s$/.test(before) ? " " : ""}${tag} `;
    const next = (before + add + value.slice(end)).slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + add.length, at + add.length);
    });
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
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => mirror.current && (mirror.current.scrollTop = e.currentTarget.scrollTop)}
          className={cn(box, "relative block resize-y bg-transparent text-transparent caret-neutral-100 placeholder:text-neutral-500 focus:outline-none selection:bg-brand-500/30")}
        />
      </div>
      {tags > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          Type @ to reference:
          {Array.from({ length: tags }, (_, i) => `@image${i + 1}`).map((t) => (
            <button key={t} type="button" onClick={() => insert(t)} className="rounded-md bg-brand-500/20 px-1.5 py-0.5 font-mono text-brand-300 ring-1 ring-brand-500/40 hover:bg-brand-500/30">
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
