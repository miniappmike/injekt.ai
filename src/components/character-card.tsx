import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface CharacterCardData {
  id: string;
  name: string;
  identityLine: string | null;
  /** Signed links: her profile photo, and up to three reference images (photos first, then sheets). */
  photo: string | null;
  thumbs: string[];
}

/**
 * A character as a poster: her first reference large, with her name over a dark fade, the rest of her references in a
 * strip, and her identity line. The whole card lifts and the picture zooms a little on hover.
 */
export function CharacterCard({ c }: { c: CharacterCardData }) {
  const [cover, ...rest] = c.thumbs;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-[0_14px_40px_-24px_rgb(0_0_0/0.9)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-[0_24px_50px_-24px_rgb(232_38_94/0.45)]">
      <Link href={`/characters/${c.id}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-[4/3] overflow-hidden bg-neutral-800">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgb(232_38_94/0.25),transparent_60%),radial-gradient(circle_at_80%_80%,rgb(91_91_246/0.2),transparent_60%)] text-xs text-neutral-400">
            No reference images yet
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent" />
        {rest.length > 0 && (
          <div className="absolute right-3 top-3 flex gap-1.5">
            {rest.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-12 w-9 rounded-md object-cover object-top ring-1 ring-white/15 shadow-lg" />
            ))}
          </div>
        )}
      </Link>
      <div className="relative -mt-10 flex flex-1 flex-col gap-2 px-4 pb-4">
        <div className="flex items-center gap-2.5">
          {c.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-neutral-950 shadow-[0_0_0_3px_rgb(232_38_94/0.45)]" />
          ) : (
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 font-display text-lg font-bold text-white ring-2 ring-neutral-950">
              {c.name.charAt(0)}
            </span>
          )}
          <h3 className="truncate text-xl font-bold text-neutral-50 drop-shadow">{c.name}</h3>
        </div>
        <p className="line-clamp-3 text-sm leading-relaxed text-neutral-400">{c.identityLine ?? "No identity line yet"}</p>
        <div className="mt-auto flex justify-end pt-1">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/characters/${c.id}`}>Edit</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
