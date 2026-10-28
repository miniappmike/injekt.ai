"use client";

import { useState } from "react";
import { InjectWriter } from "@/components/inject-writer";
import { QuickGenerate, type QuickCharacter } from "@/components/quick-generate";
import { limitMessage } from "@/lib/limits";

type Tab = "write" | "direct_swap" | "edit";
const TABS: { id: Tab; label: string }[] = [
  { id: "write", label: "Write prompts" },
  { id: "direct_swap", label: "Direct swap" },
  { id: "edit", label: "Edit" },
];

export function InjectTabs({
  characters,
  isPro,
  freeImagesLeft,
}: {
  characters: (QuickCharacter & { ready: boolean; hasProfile: boolean })[];
  isPro: boolean;
  freeImagesLeft: number | null;
}) {
  // Free accounts can't write prompts, so they start on the tabs they can use for their one free image.
  const [tab, setTab] = useState<Tab>(isPro ? "write" : "direct_swap");

  return (
    <div className="mt-6">
      <div className="flex gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "write" &&
        (isPro ? (
          characters.length ? (
            <InjectWriter characters={characters} />
          ) : (
            <QuickGenerate mode="edit" characters={[]} freeImagesLeft={null} />
          )
        ) : (
          <p className="mt-6 rounded-md border border-neutral-800 p-4 text-neutral-300">{limitMessage("prompt_writer")}</p>
        ))}
      {tab === "direct_swap" && <QuickGenerate mode="direct_swap" characters={characters} freeImagesLeft={freeImagesLeft} />}
      {tab === "edit" && <QuickGenerate mode="edit" characters={characters} freeImagesLeft={freeImagesLeft} />}
    </div>
  );
}
