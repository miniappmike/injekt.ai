"use client";

import { useState, useTransition } from "react";
import { ImageSlot, type SlotImage } from "@/components/image-slot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { savePhoneDescription } from "@/app/(app)/characters/media-actions";
import { MAX_PHONE_DESCRIPTION } from "@/lib/ai/prompts/phone";

/**
 * Her phone: a photo and/or a few words. Whenever the prompt writers see a phone in the shot (a mirror selfie, in her
 * hand), they write her phone instead of a generic one.
 */
export function PhoneCard({ characterId, name, description, images }: { characterId: string; name: string; description: string | null; images: SlotImage[] }) {
  const [text, setText] = useState(description ?? "");
  const [saved, setSaved] = useState(description ?? "");
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await savePhoneDescription(characterId, text).catch(() => ({ ok: false, error: "Couldn't save. Try again." }));
      if (r.ok) setSaved(text.trim());
      setMsg(r.ok ? { text: "Saved", good: true } : { text: r.error ?? "Couldn't save.", good: false });
    });
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-start">
      <ImageSlot label="Phone photo" slot="phone" characterId={characterId} images={images} hint="Any clear photo of the phone." />
      <div className="flex flex-col gap-2">
        <label htmlFor="phone-description" className="text-sm font-semibold">Description</label>
        <Textarea
          id="phone-description"
          rows={3}
          maxLength={MAX_PHONE_DESCRIPTION}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMsg(null);
          }}
          placeholder="e.g. iPhone 15 Pro in natural titanium, clear case with pressed pink flowers"
        />
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" variant="secondary" disabled={busy || text.trim() === saved.trim()} onClick={save}>
            {busy ? "Saving..." : "Save phone"}
          </Button>
          {msg && <span className={`text-xs ${msg.good ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
        </div>
        <p className="text-xs text-neutral-500">When a phone shows up in a shot, prompts write {name}&apos;s phone from these.</p>
      </div>
    </div>
  );
}
