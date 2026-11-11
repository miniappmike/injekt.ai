import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SparkIcon } from "@/components/icons";
import { CharacterImagesButton, DeleteCharacterButton, type CardImage } from "@/components/character-card-actions";

export interface CharacterCardData {
  id: string;
  name: string;
  identityLine: string | null;
  /** Signed links: her profile photo, and up to three reference images (photos first, then sheets). */
  photo: string | null;
  thumbs: string[];
  /** All of her reference images and sheets, labelled, for the magnifier. */
  images: CardImage[];
}

/**
 * A character as a poster: her first reference large, with her name over a dark fade, the rest of her references in a
 * strip, and her identity line. The whole card lifts and the picture zooms a little on hover.
 */
export function CharacterCard({ c, canList = false }: { c: CharacterCardData; canList?: boolean }) {
  const [cover, ...rest] = c.thumbs;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 max-sm:rounded-[1.25rem] shadow-[0_14px_40px_-24px_rgb(0_0_0/0.9)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-[0_24px_50px_-24px_rgb(232_38_94/0.45)]">
      <Link href={`/characters/${c.id}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/3] overflow-hidden bg-neutral-800 max-sm:aspect-[4/5]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgb(232_38_94/0.25),transparent_60%),radial-gradient(circle_at_80%_80%,rgb(91_91_246/0.2),transparent_60%)] text-xs text-neutral-400">
            <span className="max-sm:hidden">No reference images yet</span>
            <span className="font-display text-4xl font-bold text-white/80 sm:hidden">{c.name.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent max-sm:via-transparent max-sm:from-neutral-900/70" />
        {/* Phones: whether she's ready to use, over the picture. */}
        <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 sm:hidden ${cover ? "bg-neutral-950/80 text-neutral-100 ring-white/10" : "bg-amber-400/90 text-amber-950 ring-amber-300"}`}>
          {cover ? "Ready" : "Add photos"}
        </span>
        {rest.length > 0 && (
          <div className="absolute right-3 top-3 flex gap-1.5 max-sm:hidden">
            {rest.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-12 w-9 rounded-md object-cover object-top ring-1 ring-white/15 shadow-lg" />
            ))}
          </div>
        )}
      </Link>
      <CharacterImagesButton name={c.name} images={c.images} />
      {/* Phones: straight into Inject with her picked. */}
      <Link
        href={`/inject?character=${c.id}`}
        aria-label={`Use ${c.name} in Inject`}
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950/70 text-neutral-50 ring-1 ring-white/15 backdrop-blur transition-transform active:scale-90 sm:hidden"
      >
        <SparkIcon className="h-[18px] w-[18px]" />
      </Link>
      <div className="relative -mt-10 flex flex-1 flex-col gap-2 px-4 pb-4 max-sm:mt-0 max-sm:gap-0.5 max-sm:px-3 max-sm:pb-3 max-sm:pt-2">
        <div className="flex items-center gap-2.5">
          <Link href={`/characters/${c.id}`} className="truncate text-sm font-semibold text-neutral-50 sm:hidden">{c.name}</Link>
          {c.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-neutral-950 shadow-[0_0_0_3px_rgb(232_38_94/0.45)] max-sm:hidden" />
          ) : (
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 font-display text-lg font-bold text-white ring-2 ring-neutral-950 max-sm:hidden">
              {c.name.charAt(0)}
            </span>
          )}
          <h3 className="truncate text-xl font-bold text-neutral-50 drop-shadow max-sm:hidden">{c.name}</h3>
        </div>
        <p className="line-clamp-3 text-sm leading-relaxed text-neutral-400 max-sm:line-clamp-1 max-sm:text-xs">{c.identityLine ?? "No identity line yet"}</p>
        <div className="mt-auto flex justify-end gap-2 pt-1 max-sm:mt-2 max-sm:items-center max-sm:justify-between">
          {/* Phones: just List (admin) and a trash icon; the card itself opens her page. */}
          <div className="flex w-full items-center justify-between gap-2 sm:hidden">
            {canList ? (
              <Link href={`/characters/${c.id}#marketplace`} className="flex h-9 flex-1 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-transform active:scale-95">List</Link>
            ) : (
              <Link href={`/characters/${c.id}`} className="flex h-9 flex-1 items-center justify-center rounded-xl bg-neutral-800 text-sm font-semibold text-neutral-100 transition-transform active:scale-95">Edit</Link>
            )}
            <DeleteCharacterButton id={c.id} name={c.name} icon />
          </div>
          <div className="contents max-sm:hidden">
          {canList && (
            <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500">
              <Link href={`/characters/${c.id}#marketplace`}>List</Link>
            </Button>
          )}
          <DeleteCharacterButton id={c.id} name={c.name} />
          <Button asChild size="sm" variant="secondary">
            <Link href={`/characters/${c.id}`}>Edit</Link>
          </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
