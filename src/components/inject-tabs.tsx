"use client";

import Link from "next/link";
import { useState } from "react";
import { InjectWriter } from "@/components/inject-writer";
import { QuickGenerate, type QuickCharacter } from "@/components/quick-generate";
import { useGeneration } from "@/components/app-context";
import type { SavedOutfit } from "@/lib/outfits";
import { segItem, segTrack } from "@/components/ui/segmented";

type Tab = "write" | "direct_swap" | "edit";
const TABS: { id: Tab; label: string; generationOnly?: boolean }[] = [
  { id: "write", label: "Write prompts" },
  { id: "direct_swap", label: "Direct swap" },
  // Your own prompt sent straight to the image model, so only with image generation on.
  { id: "edit", label: "Edit", generationOnly: true },
];

/** The first step for someone with no character yet. */
export function CreateCharacterFirst() {
  return (
    <div className="panel mt-6 flex flex-col items-start gap-3 p-6">
      <p className="font-display text-lg font-bold text-neutral-50">First, create your character</p>
      <p className="max-w-lg text-sm text-neutral-400">
        A character is the person you want in your photos: a name and a few pictures of her face and body. Every prompt here is written to keep her looking exactly like herself.
      </p>
      <Link href="/characters/new" className="glow-brand inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-95">
        Create a character
      </Link>
    </div>
  );
}

export function InjectTabs({
  characters,
  outfits = [],
  initialCharacterId,
}: {
  characters: (QuickCharacter & { ready: boolean; hasProfile: boolean })[];
  outfits?: SavedOutfit[];
  /** Opened from a character's card. */
  initialCharacterId?: string;
}) {
  const generation = useGeneration();
  const [tab, setTab] = useState<Tab>("write");
  const tabs = TABS.filter((t) => generation || !t.generationOnly);

  if (!characters.length && !generation) return <CreateCharacterFirst />;

  return (
    <div className="mt-5">
      <div className={segTrack} role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={segItem(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "write" && (characters.length ? <InjectWriter characters={characters} outfits={outfits} initialCharacterId={initialCharacterId} /> : <QuickGenerate mode="edit" characters={[]} />)}
      {tab === "direct_swap" && <QuickGenerate mode="direct_swap" characters={characters} />}
      {tab === "edit" && generation && <QuickGenerate mode="edit" characters={characters} />}
    </div>
  );
}
