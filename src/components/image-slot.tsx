"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { requestUpload, removeCharacterImage } from "@/app/(app)/characters/media-actions";
import type { UploadSlot } from "@/lib/images";

const MAX_BYTES = 15 * 1024 * 1024;

export async function uploadImage(file: File, slot: UploadSlot, characterId?: string): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG or WebP image");
  if (file.size > MAX_BYTES) throw new Error("Image is over 15 MB");
  const ticket = await requestUpload();
  if ("error" in ticket) throw new Error(ticket.error);
  const { error } = await createBrowserSupabase().storage.from("character-media").uploadToSignedUrl(ticket.path, ticket.token, file);
  if (error) throw new Error("Upload failed");
  const res = await fetch("/api/uploads/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawPath: ticket.path, slot, characterId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json.path as string;
}

export function ImageSlot({
  label,
  slot,
  characterId,
  images,
  max = 1,
  hint,
}: {
  label: string;
  slot: Exclude<UploadSlot, "target">;
  characterId: string;
  /** Existing images with a signed preview URL. */
  images: { path: string; url: string }[];
  max?: number;
  hint?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function add(files: FileList | File[] | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(undefined);
    try {
      const room = max === 1 ? 1 : max - images.length;
      for (const file of Array.from(files).slice(0, room)) {
        await uploadImage(file, slot, characterId);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(path: string) {
    setBusy(true);
    await removeCharacterImage(characterId, slot, path);
    router.refresh();
    setBusy(false);
  }

  const full = max > 1 && images.length >= max;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-700 p-3"
      onPaste={(e) => add(e.clipboardData.files)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
      tabIndex={0}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {!full && (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading..." : images.length && max === 1 ? "Replace" : "Upload"}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={max > 1}
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={label} className="h-24 w-24 rounded-md object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                disabled={busy}
                onClick={() => remove(img.path)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-900"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
