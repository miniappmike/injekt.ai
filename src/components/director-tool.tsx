"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPicker } from "@/components/character-picker";
import { GenerateImage } from "@/components/generate-image";
import { useGeneration } from "@/components/app-context";
import { MAX_DIRECTION } from "@/lib/ai/prompts/director";

const REALISM_KEY = "ms.directorRealism";

interface DirectorCharacter {
  id: string;
  name: string;
  /** Has both a face sheet and a body sheet. */
  ready: boolean;
  photo?: string | null;
}

/**
 * Director: she is picked, the shot is described in plain words, and Generate does the rest. The prompt is written on
 * the server and never shown; her face sheet and body sheet always go with it as @image1 and @image2.
 */
export function DirectorTool({ characters }: { characters: DirectorCharacter[] }) {
  const generation = useGeneration();
  const [characterId, setCharacterId] = useState(characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [direction, setDirection] = useState("");
  // Inject realism: on unless turned off, and remembered in this browser.
  const [realism, setRealism] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(REALISM_KEY) === "0") setRealism(false);
    } catch {
      // Stays on in a private window.
    }
  }, []);
  const toggleRealism = (on: boolean) => {
    setRealism(on);
    try {
      localStorage.setItem(REALISM_KEY, on ? "1" : "0");
    } catch {
      // Not remembered in a private window.
    }
  };
  const character = characters.find((c) => c.id === characterId)!;

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <section className="panel flex flex-col gap-2 p-4">
        <Label htmlFor="director-character">Character</Label>
        <CharacterPicker
          id="director-character"
          value={characterId}
          onChange={setCharacterId}
          characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, note: c.ready ? undefined : "Needs both sheets" }))}
        />
        {!character.ready && (
          <p className="text-sm text-amber-400">
            Director always sends {character.name}&apos;s face sheet and body sheet. Make both on <Link href={`/characters/${character.id}`} className="underline">her character page</Link> first.
          </p>
        )}
        {character.ready && <p className="text-xs text-neutral-500">Sent with every image: @image1 her face sheet, @image2 her body sheet, under her identity and body lock.</p>}
      </section>

      <section className="panel flex flex-col gap-3 p-4">
        <Label htmlFor="direction">What do you want to see?</Label>
        <Textarea
          id="direction"
          value={direction}
          maxLength={MAX_DIRECTION}
          rows={5}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="Describe the shot in your own words: where she is, what she's wearing and doing, the mood, the time of day…"
        />
        <p className="text-xs text-neutral-500">Anything you leave out (the place, outfit, pose, light) is chosen to fit. Each press makes a fresh take.</p>
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 text-sm transition-colors hover:border-neutral-500 has-[:checked]:border-brand-500/70 has-[:checked]:bg-brand-500/15">
          <input type="checkbox" checked={realism} onChange={(e) => toggleRealism(e.target.checked)} /> Inject realism
          <InfoTip label="About Inject realism">
            On: the prompt adds real skin texture, natural light, depth and shadows, so it looks like a real photo. Off: nothing is added, and fantastical things you ask for (a dragon, magic, another world) are left exactly as you imagine them.
          </InfoTip>
        </label>
        {generation ? (
          character.ready && (
            <GenerateImage key={characterId} prompt={direction} characterId={characterId} extraPaths={[]} kind="inject" meta={{ direct: true, real: realism }} actionLabel="Generate" />
          )
        ) : (
          <p className="text-sm text-amber-400">
            Director makes the image here, so it needs image generation. Turn it on in <Link href="/settings/api-keys" className="underline">Settings</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
