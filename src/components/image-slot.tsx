"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { requestUpload, removeCharacterImage, removePendingImage } from "@/app/(app)/characters/media-actions";
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

export interface SlotImage {
  path: string;
  url: string;
}

/**
 * One upload box. With a characterId it saves straight onto that character. Without one (the
 * new-character page) it keeps the uploaded images in the parent through `draft`, and they are
 * attached when the character is saved.
 */
export function ImageSlot({
  label,
  slot,
  characterId,
  images,
  draft,
  max = 1,
  hint,
}: {
  label: string;
  slot: Exclude<UploadSlot, "target">;
  characterId?: string;
  /** Existing images with a signed preview URL (saved characters). */
  images?: SlotImage[];
  /** New-character page: images held in the form until it is saved. */
  draft?: { images: SlotImage[]; onChange: (images: SlotImage[]) => void };
  max?: number;
  hint?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const current = draft ? draft.images : (images ?? []);

  async function add(files: FileList | File[] | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(undefined);
    try {
      const room = max === 1 ? 1 : max - current.length;
      let next = current;
      for (const file of Array.from(files).slice(0, room)) {
        const path = await uploadImage(file, slot, characterId);
        if (draft) {
          // A single-image box replaces its previous draft upload.
          if (max === 1) for (const old of next) await removePendingImage(old.path);
          next = max === 1 ? [{ path, url: URL.createObjectURL(file) }] : [...next, { path, url: URL.createObjectURL(file) }];
        }
      }
      if (draft) draft.onChange(next);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(path: string) {
    setBusy(true);
    if (draft) {
      await removePendingImage(path);
      draft.onChange(draft.images.filter((i) => i.path !== path));
    } else if (characterId) {
      await removeCharacterImage(characterId, slot, path);
      router.refresh();
    }
    setBusy(false);
  }

  const full = max > 1 && current.length >= max;
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
            {busy ? "Uploading..." : current.length && max === 1 ? "Replace" : "Upload"}
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
      {current.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {current.map((img) => (
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
