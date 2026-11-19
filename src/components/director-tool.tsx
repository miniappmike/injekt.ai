"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPicker } from "@/components/character-picker";
import { GenerateImage } from "@/components/generate-image";
import { GroupAdd } from "@/components/group-add";
import { useGeneration } from "@/components/app-context";
import { ImageDrop } from "@/components/image-drop";
import { uploadImage } from "@/components/image-slot";
import { Button } from "@/components/ui/button";
import { tokenGate } from "@/components/out-of-tokens";
import { MAX_DIRECTION } from "@/lib/ai/prompts/director";
import { directorEditPrompt, MAX_EDIT_CHANGES } from "@/lib/ai/prompts/director-edit";
import { writeDirectorEdit } from "@/app/(app)/director/actions";
import { useDraftState } from "@/lib/drafts";

const REALISM_KEY = "ms.directorRealism";
const GROUP_DEFAULT = "A candid photo of them together, like friends posing for a photo on a night out, each in a stylish outfit that suits the setting.";

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
export function DirectorTool({ characters, initialCharacterId }: { characters: DirectorCharacter[]; initialCharacterId?: string }) {
  const generation = useGeneration();
  // Who and what you typed come back if the phone closes the app before you press Generate (see src/lib/drafts.ts).
  const [characterId, setCharacterId] = useDraftState("director.character", initialCharacterId ?? characters.find((c) => c.ready)?.id ?? characters[0].id, {
    skip: !!initialCharacterId,
    decode: (v) => (characters.some((c) => c.id === v) ? (v as string) : null),
  });
  const [direction, setDirection] = useDraftState("director.direction", "", { decode: (v) => (typeof v === "string" ? v.slice(0, MAX_DIRECTION) : null) });
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
  // Group photo mode: the other characters added under the picker (see GroupAdd).
  const [groupIds, setGroupIds] = useDraftState<string[]>("director.group", [], {
    decode: (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && characters.some((c) => c.id === x)) : null),
  });
  const extras = groupIds.filter((id) => id !== characterId && characters.some((c) => c.id === id));
  // Edit a photo mode: upload a photo, say what should change, optionally have the prompt written, then Generate.
  const [mode, setMode] = useDraftState<"new" | "edit">("director.mode", "new", { decode: (v) => (v === "new" || v === "edit" ? v : null) });
  const editing = mode === "edit";
  const groupOn = !editing && extras.length > 0;
  const [photo, setPhoto] = useState<{ preview: string; path?: string; busy?: boolean; error?: string } | null>(null);
  const [changes, setChanges] = useDraftState("director.changes", "", { decode: (v) => (typeof v === "string" ? v.slice(0, MAX_EDIT_CHANGES) : null) });
  const [written, setWritten] = useState("");
  const [writing, setWriting] = useState<{ busy?: boolean; error?: string }>({});
  const [keepHer, setKeepHer] = useState(true);
  const pickPhoto = async (file: File) => {
    const preview = URL.createObjectURL(file);
    setPhoto({ preview, busy: true });
    setWritten("");
    try {
      const path = await uploadImage(file, "target");
      setPhoto((p) => (p?.preview === preview ? { preview, path } : p));
    } catch (e) {
      setPhoto((p) => (p?.preview === preview ? { preview, error: e instanceof Error ? e.message : "Upload failed" } : p));
    }
  };
  const writeEdit = async () => {
    if (!photo?.path) return;
    setWriting({ busy: true });
    const r = await writeDirectorEdit({ photoPath: photo.path, changes, keepHer: keepHer && character.ready }).catch(() => ({ ok: false as const, error: "Couldn't write the prompt. Try again." }));
    if (r.ok) setWritten(r.text);
    setWriting(r.ok ? {} : { error: tokenGate(r.error) });
  };
  const sheetsOn = keepHer && character.ready;
  const editText = directorEditPrompt(written.trim() || changes, sheetsOn);

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
        {!character.ready && !editing && (
          <p className="text-sm text-amber-400">
            Director always sends {character.name}&apos;s face sheet and body sheet. Make both on <Link href={`/characters/${character.id}`} className="underline">her character page</Link> first.
          </p>
        )}
        {character.ready && !groupOn && !editing && <p className="text-xs text-neutral-500">Sent with every image: @image1 her face sheet, @image2 her body sheet, under her identity and body lock.</p>}
        {generation && !editing && (
          <GroupAdd
            primaryId={characterId}
            value={groupIds}
            onChange={setGroupIds}
            characters={characters.map((c) => ({ id: c.id, name: c.name, photo: c.photo, sheet: c.ready }))}
          />
        )}
      </section>

      <section className="panel flex flex-col gap-3 p-4">
        <div role="tablist" aria-label="Director mode" className="flex w-fit gap-1 rounded-full border border-neutral-700 p-1 text-sm">
          {(
            [
              ["new", "New shot"],
              ["edit", "Edit a photo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`rounded-full px-3 py-1 transition-colors ${mode === id ? "bg-brand-500/20 text-neutral-50" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {editing ? (
          <>
            <Label>Photo to edit</Label>
            <ImageDrop title={photo ? "Replace photo" : "Photo"} hint="Any photo: drop, paste or pick one." preview={photo?.preview} onPick={(f) => void pickPhoto(f)} />
            {photo?.busy && <p className="text-xs text-neutral-400">Uploading...</p>}
            {photo?.error && <p className="text-sm text-red-400">{photo.error}</p>}
            <Label htmlFor="edit-changes">What should change?</Label>
            <Textarea
              id="edit-changes"
              value={changes}
              maxLength={MAX_EDIT_CHANGES}
              rows={4}
              onChange={(e) => setChanges(e.target.value)}
              placeholder="In your own words, e.g. put her in a red summer dress, make it golden hour, swap the background for a rooftop bar…"
            />
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={keepHer} disabled={!character.ready} onChange={(e) => setKeepHer(e.target.checked)} /> Keep {character.name}&apos;s likeness
              <InfoTip label="About keeping her likeness">
                On: her face sheet and body sheet go with the photo (@image2 and @image3), so the woman in it looks exactly like her. Turn it off to edit a photo of anyone and keep them as they are.
              </InfoTip>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!photo?.path || !changes.trim() || writing.busy} onClick={() => void writeEdit()}>
                {writing.busy ? "Writing..." : written ? "Write it again" : "Write the prompt with AI (optional)"}
              </Button>
              {writing.error && <span className="text-sm text-red-400">{writing.error}</span>}
            </div>
            {written && (
              <>
                <Label htmlFor="edit-prompt">Edit prompt (change anything you like)</Label>
                <Textarea id="edit-prompt" value={written} maxLength={MAX_EDIT_CHANGES} rows={5} onChange={(e) => setWritten(e.target.value)} />
                <button type="button" onClick={() => setWritten("")} className="w-fit text-xs text-neutral-400 underline">
                  Use my own words instead
                </button>
              </>
            )}
            {generation ? (
              photo?.path && changes.trim() ? (
                <GenerateImage
                  key={`${photo.path}|${sheetsOn ? characterId : ""}`}
                  prompt={editText}
                  characterId={sheetsOn ? characterId : null}
                  extraPaths={[]}
                  kind="edit"
                  meta={{ target: photo.path, refs: sheetsOn ? ["face_sheet", "body_sheet"] : [] }}
                  actionLabel="Generate edit"
                />
              ) : (
                <p className="text-xs text-neutral-500">Add a photo and describe the changes to generate.</p>
              )
            ) : (
              <p className="text-sm text-amber-400">
                Editing makes the image here, so it needs image generation. Turn it on in <Link href="/settings/api-keys" className="underline">Settings</Link>.
              </p>
            )}
          </>
        ) : (
          <>
        <Label htmlFor="direction">What do you want to see?</Label>
        <Textarea
          id="direction"
          value={direction}
          maxLength={MAX_DIRECTION}
          rows={5}
          onChange={(e) => setDirection(e.target.value)}
          placeholder={
            groupOn
              ? `Describe the shot and use their names: who stands where, what each wears and does, the place, the mood… e.g. "${character.name} on the left in a red dress, ${characters.find((c) => c.id === extras[0])?.name ?? "her friend"} laughing beside her, neon-lit street at night."`
              : "Describe the shot in your own words: where she is, what she's wearing and doing, the mood, the time of day…"
          }
        />
        <p className="text-xs text-neutral-500">Anything you leave out (the place, outfit, pose, light) is chosen to fit. Each press makes a fresh take.</p>
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 text-sm transition-colors hover:border-neutral-500 has-[:checked]:border-brand-500/70 has-[:checked]:bg-brand-500/15">
          <input type="checkbox" checked={realism} onChange={(e) => toggleRealism(e.target.checked)} /> Inject realism
          <InfoTip label="About Inject realism">
            On: the prompt adds real skin texture, natural light, depth and shadows, so it looks like a real photo. Off: nothing is added, and fantastical things you ask for (a dragon, magic, another world) are left exactly as you imagine them.
          </InfoTip>
        </label>
        {generation ? (
          character.ready &&
          (groupOn ? (
            <GenerateImage
              key={[characterId, ...extras].join()}
              prompt={direction.trim() || GROUP_DEFAULT}
              extraPaths={[]}
              kind="group_photo"
              meta={{ group: [characterId, ...extras], real: realism }}
              actionLabel="Create group photo"
              autoAspectRatio="3:2"
            />
          ) : (
            <GenerateImage key={characterId} prompt={direction} characterId={characterId} extraPaths={[]} kind="inject" meta={{ direct: true, real: realism }} actionLabel="Generate" />
          ))
        ) : (
          <p className="text-sm text-amber-400">
            Director makes the image here, so it needs image generation. Turn it on in <Link href="/settings/api-keys" className="underline">Settings</Link>.
          </p>
        )}
          </>
        )}
      </section>
    </div>
  );
}
