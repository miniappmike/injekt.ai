"use client";

/** One image to attach, as the Write only prompts list them (see AttachItem in variants-run). */
export interface AttachTile {
  tag: string;
  label: string;
  source: "ref" | "photo" | "extra";
  index?: number;
  url?: string;
  downloadUrl?: string;
}

// One colour per @image number, used on the tile and on the matching tag in the prompt, so they pair up at a glance.
const TONES = [
  { ring: "ring-sky-400", badge: "bg-sky-400 text-sky-950", text: "bg-sky-400/15 text-sky-300 ring-sky-400/40" },
  { ring: "ring-fuchsia-400", badge: "bg-fuchsia-400 text-fuchsia-950", text: "bg-fuchsia-400/15 text-fuchsia-300 ring-fuchsia-400/40" },
  { ring: "ring-amber-400", badge: "bg-amber-400 text-amber-950", text: "bg-amber-400/15 text-amber-300 ring-amber-400/40" },
  { ring: "ring-emerald-400", badge: "bg-emerald-400 text-emerald-950", text: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40" },
  { ring: "ring-rose-400", badge: "bg-rose-400 text-rose-950", text: "bg-rose-400/15 text-rose-300 ring-rose-400/40" },
] as const;
const tone = (tag: string) => TONES[(Math.max(1, Number(tag.replace(/\D/g, "")) || 1) - 1) % TONES.length];

/**
 * The images to load into another generator, in order: a thumbnail of each with its @image badge, what it is, and a
 * Save link for her sheets (the photo and extras are already the person's own files).
 */
export function AttachStrip({ items, photo, extras }: { items: AttachTile[]; photo: string; extras: string[] }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-950/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Attach these in your generator, in this order</p>
      <ol className="mt-3 flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="Images to attach, in order">
        {items.map((x, i) => {
          const t = tone(x.tag);
          const src = x.source === "photo" ? photo : x.source === "extra" ? extras[x.index ?? 0] : x.url;
          return (
            <li key={x.tag} className="flex items-start gap-2">
              {i > 0 && <span aria-hidden className="mt-8 text-lg text-neutral-600">→</span>}
              <figure className="flex w-24 flex-col items-center gap-1.5 text-center">
                <div className="relative">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={x.label} className={`h-20 w-20 rounded-lg object-cover ring-2 ${t.ring}`} />
                  ) : (
                    <div className={`flex h-20 w-20 items-center justify-center rounded-lg bg-neutral-800 px-1 text-[11px] text-neutral-400 ring-2 ${t.ring}`}>{x.label}</div>
                  )}
                  <span className={`absolute -left-2 -top-2 rounded-full px-2 py-0.5 text-xs font-bold shadow ${t.badge}`}>{x.tag}</span>
                </div>
                <figcaption className="text-xs leading-tight text-neutral-300">{x.label}</figcaption>
                {x.downloadUrl && (
                  <a href={x.downloadUrl} className="text-[11px] text-neutral-400 underline hover:text-neutral-200">Save image</a>
                )}
              </figure>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The prompt text with each @image tag in its tile's colour. */
export function TaggedPrompt({ text }: { text: string }) {
  const parts = text.split(/(@image\d+)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^@image\d+$/.test(p) ? (
          <span key={i} className={`rounded px-1 font-semibold ring-1 ${tone(p).text}`}>{p}</span>
        ) : (
          p
        ),
      )}
    </p>
  );
}
