"use client";

import { useRef } from "react";
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
}: {
  title: string;
  hint?: string;
  preview?: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  layout?: "row" | "tile";
}) {
  const input = useRef<HTMLInputElement>(null);
  const take = (files: FileList | File[] | null) => {
    const f = files && Array.from(files).find((x) => x.type.startsWith("image/"));
    if (f) onPick(f);
  };
  const open = () => {
    if (!disabled) input.current?.click();
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
      className={`dropzone group min-w-0 cursor-pointer ${tile ? "flex flex-col gap-2.5 p-3" : "flex items-center gap-4 p-3"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      onPaste={(e) => take(e.clipboardData.files)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files);
      }}
    >
      {tile ? <div className="h-28 w-full sm:h-32">{picture}</div> : <div className="shrink-0">{picture}</div>}
      <div className={`flex min-w-0 flex-1 ${tile ? "items-start justify-between gap-2" : "items-center justify-between gap-3"}`}>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="line-clamp-2 text-xs text-neutral-500">{hint ?? "Click, drop, or paste with Ctrl+V. JPEG, PNG or WebP."}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {preview ? "Replace" : "Add image"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
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
