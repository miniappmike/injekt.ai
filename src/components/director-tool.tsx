"use client";

import Link from "next/link";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPicker } from "@/components/character-picker";
import { GenerateImage } from "@/components/generate-image";
import { useGeneration } from "@/components/app-context";
import { MAX_DIRECTION } from "@/lib/ai/prompts/director";

interface DirectorCharacter {
  id: string;
  name: string;
  /** Has both a face sheet and a body sheet. */
  ready: boolean;
  photo?: string | null;
}

const IDEAS = [
  "Mirror selfie in a tidy bathroom, oversized grey hoodie and bike shorts, morning light",
  "Sitting on a café terrace in Paris at golden hour, white linen dress, laughing at someone off camera",
  "Gym floor, black sports bra and leggings, mid-squat, side angle from hip height",
];

/**
 * Director: she is picked, the shot is described in plain words, and Generate does the rest. The prompt is written on
 * the server and never shown; her face sheet and body sheet always go with it as @image1 and @image2.
 */
export function DirectorTool({ characters }: { characters: DirectorCharacter[] }) {
  const generation = useGeneration();
  const [characterId, setCharacterId] = useState(characters.find((c) => c.ready)?.id ?? characters[0].id);
  const [direction, setDirection] = useState("");
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
        <div className="flex flex-wrap gap-1.5" aria-label="Ideas">
          {IDEAS.map((idea) => (
            <button key={idea} type="button" onClick={() => setDirection(idea)} className="rounded-full border border-neutral-700 px-2.5 py-1 text-left text-xs text-neutral-300 transition-colors hover:border-brand-500/60 hover:text-white">
              {idea}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">Anything you leave out (the place, outfit, pose, light) is chosen to fit. Each press makes a fresh take.</p>
        {generation ? (
          character.ready && (
            <GenerateImage key={characterId} prompt={direction} characterId={characterId} extraPaths={[]} kind="inject" meta={{ direct: true }} actionLabel="Generate" />
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
