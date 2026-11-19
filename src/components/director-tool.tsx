"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import { TagTextarea } from "@/components/tag-textarea";

/** Seedream takes 10 images at most; her two sheets (Keep likeness) take two of them. */
const MAX_IMAGES = 10;

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
  const [photos, setPhotos] = useState<{ preview: string; path?: string; busy?: boolean; error?: string }[]>([]);
  const [changes, setChanges] = useDraftState("director.changes", "", { decode: (v) => (typeof v === "string" ? v.slice(0, MAX_EDIT_CHANGES) : null) });
  const [written, setWritten] = useState("");
  const [writing, setWriting] = useState<{ busy?: boolean; error?: string }>({});
  const [keepHer, setKeepHer] = useState(true);
  const sheetsOn = keepHer && character.ready;
  const count = useRef(0);
  useEffect(() => {
    count.current = photos.length;
  }, [photos.length]);
  // Uploads are @image1..@imageN; her sheets (when on) come right after them.
  const maxPhotos = MAX_IMAGES - (sheetsOn ? 2 : 0);
  const pickPhoto = async (file: File) => {
    const preview = URL.createObjectURL(file);
    // Several files arrive at once; the ref counts them before React re-renders.
    if (count.current >= maxPhotos) return;
    count.current += 1;
    setPhotos((list) => [...list, { preview, busy: true }]);
    setWritten("");
    const set = (v: { preview: string; path?: string; error?: string }) => setPhotos((list) => list.map((p) => (p.preview === preview ? v : p)));
    try {
      set({ preview, path: await uploadImage(file, "target") });
    } catch (e) {
      set({ preview, error: e instanceof Error ? e.message : "Upload failed" });
    }
  };
  const removePhoto = (preview: string) => setPhotos((list) => list.filter((p) => p.preview !== preview));
  const ready = photos.length > 0 && photos.every((p) => p.path);
  const paths = photos.flatMap((p) => (p.path ? [p.path] : []));
  const photo = photos[0];
  const writeEdit = async () => {
    if (!photo?.path) return;
    setWriting({ busy: true });
    const r = await writeDirectorEdit({ photoPath: photo.path, extraCount: photos.length - 1, changes, keepHer: keepHer && character.ready, characterId }).catch(() => ({ ok: false as const, error: "Couldn't write the prompt. Try again." }));
    if (r.ok) setWritten(r.text);
    setWriting(r.ok ? {} : { error: tokenGate(r.error) });
  };
  const editText = directorEditPrompt(written.trim() || changes, sheetsOn, photos.length);
  const tagCount = photos.length + (sheetsOn ? 2 : 0);
  // The @ menu and the "Type @ to reference" chips: one per uploaded photo (up to 8), none before the first upload.
  const tagRefs = photos.slice(0, 8).map((p) => ({ thumb: p.preview }));

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
            <Label>Photos ({photos.length}/{maxPhotos})</Label>
            <ImageDrop
              title={photos.length ? "Add more photos" : "Photos"}
              hint={`The photo to edit is @image1; add up to ${maxPhotos} in all and refer to them by tag.${sheetsOn ? " Her sheets take 2 of the 10 slots." : ""}`}
              multiple
              full={photos.length >= maxPhotos}
              onPick={(f) => void pickPhoto(f)}
              gallery={
                photos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <div key={p.preview} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt="" className={`h-20 w-16 rounded-lg object-cover ring-1 ${p.error ? "ring-red-500" : "ring-white/10"} ${p.busy ? "opacity-50" : ""}`} />
                        <span className="absolute bottom-1 left-1 rounded bg-brand-500/90 px-1 font-mono text-[10px] text-white">@image{i + 1}</span>
                        <button type="button" aria-label={`Remove @image${i + 1}`} onClick={(e) => (e.stopPropagation(), removePhoto(p.preview))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-neutral-200 ring-1 ring-white/20">×</button>
                      </div>
                    ))}
                  </div>
                ) : undefined
              }
            />
            {photos.some((p) => p.busy) && <p className="text-xs text-neutral-400">Uploading...</p>}
            {photos.find((p) => p.error) && <p className="text-sm text-red-400">{photos.find((p) => p.error)?.error}</p>}
            {photos.length > maxPhotos && <p className="text-sm text-amber-400">Seedream takes 10 images at most and her sheets use 2. Remove {photos.length - maxPhotos} photo(s) or turn off Keep likeness.</p>}
            <Label htmlFor="edit-changes">What should change?</Label>
            <TagTextarea
              id="edit-changes"
              value={changes}
              maxLength={MAX_EDIT_CHANGES}
              rows={4}
              tags={tagCount}
              refs={tagRefs}
              onChange={setChanges}
              placeholder="In your own words, e.g. put her in a red summer dress, make it golden hour, swap the background for a rooftop bar…"
            />
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={keepHer} disabled={!character.ready} onChange={(e) => setKeepHer(e.target.checked)} /> Keep {character.name}&apos;s likeness
              <InfoTip label="About keeping her likeness">
                On: her face sheet and body sheet go after your photos (@image{Math.max(1, photos.length) + 1} and @image{Math.max(1, photos.length) + 2}), so the woman in it looks exactly like her. Turn it off to edit a photo of anyone and keep them as they are.
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
                <TagTextarea id="edit-prompt" value={written} maxLength={MAX_EDIT_CHANGES} rows={5} tags={tagCount} refs={tagRefs} onChange={setWritten} />
                <button type="button" onClick={() => setWritten("")} className="w-fit text-xs text-neutral-400 underline">
                  Use my own words instead
                </button>
              </>
            )}
            {generation ? (
              ready && changes.trim() && photos.length <= maxPhotos ? (
                <GenerateImage
                  key={`${paths.join(",")}|${sheetsOn ? characterId : ""}`}
                  prompt={editText}
                  characterId={sheetsOn ? characterId : null}
                  extraPaths={paths.slice(1)}
                  kind="edit"
                  meta={{ target: paths[0], extrasFirst: true, refs: sheetsOn ? ["face_sheet", "body_sheet"] : [] }}
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
