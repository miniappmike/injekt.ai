"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

// One image: click, drop or paste (Ctrl+V while focused). The parent decides what to do with the file.
export function ImageDrop({
  title,
  hint,
  preview,
  disabled,
  onPick,
}: {
  title: string;
  hint?: string;
  preview?: string;
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const take = (files: FileList | File[] | null) => {
    const f = files && Array.from(files).find((x) => x.type.startsWith("image/"));
    if (f) onPick(f);
  };
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-700 p-4"
      tabIndex={0}
      onPaste={(e) => take(e.clipboardData.files)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
          {preview ? "Replace" : "Add image"}
        </Button>
      </div>
      <p className="text-xs text-neutral-500">{hint ?? "Click, drop, or paste with Ctrl+V. JPEG, PNG or WebP."}</p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-40 w-40 rounded-md object-cover" />
      )}
    </section>
  );
}
