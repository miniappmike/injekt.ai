"use client";

import { useRef, useState } from "react";
import { clipboardImages, usePasteTarget } from "@/components/paste-router";
import { readClipboardImages } from "@/lib/clipboard";
import { PasteIcon, UploadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** The empty-picture mark: a framed plus. */
function AddMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} fill-none stroke-current`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

// One image: click anywhere on it, drop, or paste (Ctrl+V while focused). The parent decides what to do with the file.
// "row" (the default) is one compact line: picture, title, button. "tile" stacks them, for a row of several side by side.
export function ImageDrop({
  title,
  hint,
  preview,
  disabled,
  onPick,
  layout = "row",
  multiple = false,
  gallery,
  full = false,
}: {
  title: string;
  hint?: string;
  preview?: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  layout?: "row" | "tile";
  /** Several images at once: `onPick` is called once per image file (the parent applies any limit). */
  multiple?: boolean;
  /** Replaces the single picture: what is already in the box (thumbnails), shown inside the drop area. */
  gallery?: React.ReactNode;
  /** The box is at its limit: it stays on screen but no longer takes images. */
  full?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pasteError, setPasteError] = useState<string>();
  const box = useRef<HTMLElement>(null);
  usePasteTarget(box, (f) => take(f), disabled);
  const take = (files: FileList | File[] | null) => {
    if (full) return;
    const images = files ? Array.from(files).filter((x) => x.type.startsWith("image/")) : [];
    for (const f of multiple ? images : images.slice(0, 1)) onPick(f);
  };
  const open = () => {
    if (!disabled && !full) input.current?.click();
  };
  const tile = layout === "tile";
  const picture = preview ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={preview} alt="" className={`animate-pop-in object-cover ring-1 ring-white/10 ${tile ? "h-full w-full rounded-lg" : "h-20 w-20 rounded-lg"}`} />
  ) : (
    <div className={`flex items-center justify-center rounded-lg bg-neutral-950/50 text-neutral-500 transition-colors group-hover:text-brand-400 ${tile ? "h-full w-full" : "h-20 w-20"}`}>
      <AddMark className={tile ? "h-9 w-9" : "h-7 w-7"} />
    </div>
  );
  return (
    <section
      ref={box}
      className={`dropzone group min-w-0 cursor-pointer ${tile ? "flex flex-col gap-2.5 p-3 max-sm:gap-1.5 max-sm:rounded-2xl max-sm:p-1.5" : gallery ? "flex flex-col items-stretch gap-3 p-3 max-sm:p-2.5" : "flex items-center gap-4 p-3 max-sm:gap-3 max-sm:p-2.5"} ${disabled ? "cursor-not-allowed opacity-60" : full ? "cursor-default" : ""}`}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      onPaste={(e) => take(clipboardImages(e.clipboardData))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files);
      }}
    >
      {gallery ? <div className="w-full">{gallery}</div> : tile ? <div className="h-28 w-full max-sm:h-auto max-sm:aspect-square sm:h-32">{picture}</div> : <div className="shrink-0">{picture}</div>}
      <div className={`flex min-w-0 flex-1 ${tile ? "items-start justify-between gap-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5" : "items-center justify-between gap-3"}`}>
        <div className="min-w-0">
          <h2 className={`truncate text-sm font-semibold ${tile ? "max-sm:px-1 max-sm:text-xs" : ""}`}>{title}</h2>
          <p className={`line-clamp-2 text-xs text-neutral-500 ${tile ? "max-sm:hidden" : ""}`}>{hint ?? "Click, drop, or paste with Ctrl+V. JPEG, PNG or WebP."}</p>
          {pasteError && <p role="alert" className="mt-1 text-xs text-amber-300">{pasteError}</p>}
        </div>
        <div className={`flex shrink-0 gap-1.5 ${tile ? "max-sm:[&>*]:flex-1" : ""}`}>
          {/* Phones have no Ctrl+V: this reads the clipboard. */}
          <button
            type="button"
            disabled={disabled || full}
            aria-label={`Paste ${title.toLowerCase()} from the clipboard`}
            title="Paste from the clipboard"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                onPick((await readClipboardImages())[0]);
                setPasteError(undefined);
              } catch (err) {
                setPasteError(err instanceof Error ? err.message : "Couldn't paste.");
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800/70 text-neutral-200 transition-all hover:border-brand-500/60 hover:text-white active:scale-95 disabled:opacity-50 sm:h-8 sm:w-8"
          >
            <PasteIcon className="h-[18px] w-[18px]" />
          </button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || full}
            className={tile ? "max-sm:h-9 max-sm:px-0" : "max-sm:h-9"}
            aria-label={tile ? `Upload ${title.toLowerCase()}` : undefined}
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            {tile ? (
              <>
                <UploadIcon className="h-[18px] w-[18px] sm:hidden" />
                <span className="max-sm:hidden">{preview ? "Replace" : "Add image"}</span>
              </>
            ) : preview ? "Replace" : <><span className="sm:hidden">Upload</span><span className="max-sm:hidden">Add image</span></>}
          </Button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}
