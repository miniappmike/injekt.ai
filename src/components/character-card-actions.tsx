"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SearchIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { deleteCharacter } from "@/app/(app)/characters/actions";
import { viewImage } from "@/lib/panel-events";

export interface CardImage {
  label: string;
  url: string;
}

/** Delete with a confirmation. Deleting also removes her stored images, so it asks first. */
export function DeleteCharacterButton({ id, name, icon = false }: { id: string; name: string; icon?: boolean }) {
  return (
    <form
      action={deleteCharacter.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${name}? Her images and sheets will be removed too. This can't be undone.`)) e.preventDefault();
      }}
    >
      {icon ? (
        <button type="submit" aria-label={`Delete ${name}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600/90 text-white transition-transform active:scale-90">
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <Button type="submit" size="sm" variant="destructive">Delete</Button>
      )}
    </form>
  );
}

/**
 * A magnifying glass over her card. It opens a panel with all of her reference images and consistency sheets, each
 * labelled, so she can be checked without opening her page. Tapping one opens it full screen.
 */
export function CharacterImagesButton({ name, images }: { name: string; images: CardImage[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = before;
      document.documentElement.classList.remove("sheet-open");
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`See ${name}'s reference images and sheets`}
        className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950/70 text-neutral-50 ring-1 ring-white/15 backdrop-blur transition-all hover:scale-105 hover:bg-neutral-950/90 active:scale-90 max-sm:left-2 max-sm:top-2"
      >
        <SearchIcon className="h-[18px] w-[18px]" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${name}'s images`}>
            <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-0 animate-fade-in bg-black/75 backdrop-blur-sm" />
            <div className="panel relative flex max-h-[88dvh] w-full max-w-5xl animate-pop-in flex-col overflow-hidden max-sm:rounded-b-none sm:max-h-[90dvh]">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
                <h2 className="font-display text-lg font-bold text-neutral-50">{name}&apos;s images <span className="text-sm font-medium text-neutral-500">{images.length}</span></h2>
                <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Close</Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
                {images.length === 0 ? (
                  <p className="py-10 text-center text-sm text-neutral-400">No reference images or sheets yet.</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {images.map((img) => (
                      <li key={img.label + img.url}>
                        <button
                          type="button"
                          onClick={() => viewImage({ url: img.url, title: `${name}: ${img.label}` })}
                          className="group block w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 text-left transition-colors hover:border-brand-500/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.label} loading="lazy" className="aspect-[3/4] w-full bg-neutral-900 object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                          <span className="block px-2.5 py-1.5 text-xs font-medium text-neutral-300">{img.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
