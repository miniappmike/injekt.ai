"use client";

import { useEffect, useState } from "react";
import { CloseIcon, GroupIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Browser copy of MAX_GROUP in src/lib/ai/prompts/group.ts (that file is server prompt text). */
export const MAX_GROUP = 4;

export interface GroupCharacter {
  id: string;
  name: string;
  photo?: string | null;
  /** Has a face or body reference sheet (group photos send only sheets). */
  sheet: boolean;
}

function Face({ c, className }: { c: GroupCharacter; className?: string }) {
  return c.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.photo} alt="" className={cn("shrink-0 rounded-full object-cover object-top", className)} />
  ) : (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 text-xs font-bold text-white", className)}>
      {c.name.charAt(0) || "?"}
    </span>
  );
}

/**
 * Multi-character select under a tool's character picker: adding one or more characters turns the tool into group
 * photo mode (up to MAX_GROUP women, the picked character first). `value` is the added characters, in order. A link to
 * the page with #group opens the list at once.
 */
export function GroupAdd({
  primaryId,
  value,
  onChange,
  characters,
  disabled,
  disabledNote,
}: {
  primaryId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  characters: GroupCharacter[];
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof location !== "undefined" && location.hash === "#group") setOpen(true);
  }, []);
  // The picked character can't also be an extra.
  useEffect(() => {
    if (value.includes(primaryId)) onChange(value.filter((x) => x !== primaryId));
  }, [primaryId, value, onChange]);

  const byId = new Map(characters.map((c) => [c.id, c]));
  const added = value.map((id) => byId.get(id)).filter((c): c is GroupCharacter => !!c);
  const choices = characters.filter((c) => c.id !== primaryId && !value.includes(c.id));
  const full = added.length + 1 >= MAX_GROUP;
  const on = added.length > 0;

  if (disabled) return disabledNote ? <p className="text-xs text-neutral-500">{disabledNote}</p> : null;

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-2.5 transition-colors", on ? "border-iris-500/50 bg-iris-500/[0.07]" : "border-neutral-800")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {on && <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-iris-200"><GroupIcon className="h-4 w-4" /> Group photo</span>}
        {added.map((c) => (
          <span key={c.id} className="flex animate-pop-in items-center gap-1.5 rounded-full border border-neutral-700/80 bg-neutral-950/60 py-0.5 pl-0.5 pr-1 text-xs text-neutral-100">
            <Face c={c} className="h-6 w-6" />
            <span className="max-w-[7rem] truncate">{c.name}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== c.id))} aria-label={`Remove ${c.name}`} className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100">
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!full && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((x) => !x)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-iris-400/60 hover:text-neutral-50"
          >
            {!on && <GroupIcon className="h-4 w-4 text-iris-300" />}
            {on ? "+ Add another" : "Add characters for a group photo"}
          </button>
        )}
      </div>
      {open && !full && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Characters to add">
          {choices.length ? (
            choices.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!c.sheet}
                  title={c.sheet ? `Add ${c.name}` : `${c.name} needs a reference sheet first`}
                  onClick={() => {
                    const next = [...value, c.id];
                    onChange(next);
                    if (next.length + 1 >= MAX_GROUP) setOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950/60 py-0.5 pl-0.5 pr-2.5 text-xs text-neutral-200 transition-colors hover:border-iris-400/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Face c={c} className="h-6 w-6" />
                  <span className="max-w-[7rem] truncate">{c.name}</span>
                  {!c.sheet && <span className="text-[10px] text-neutral-500">needs a sheet</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="text-xs text-neutral-500">No other characters yet.</li>
          )}
        </ul>
      )}
      {on && <p className="text-xs text-neutral-400">{added.length + 1} women in one photo, each from her own reference sheets (up to {MAX_GROUP}). Remove them all to go back to one.</p>}
    </div>
  );
}
