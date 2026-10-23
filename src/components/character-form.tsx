"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageSlot, type SlotImage } from "@/components/image-slot";
import { useToast } from "@/components/toast";
import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import type { CharacterFormState } from "@/app/(app)/characters/actions";
import { buildProfile } from "@/app/(app)/characters/ai-actions";

type Initial = {
  name?: string;
  always_keep?: string | null;
  height?: string | null;
  weight?: string | null;
  lore?: string | null;
  profile?: CharacterProfile;
};

export function CharacterForm({
  action,
  initial = {},
  submitLabel,
  characterId,
  canBuildProfile = false,
  buildsLeft = null,
  buildsTotal,
}: {
  action: (state: CharacterFormState, formData: FormData) => Promise<CharacterFormState>;
  initial?: Initial;
  submitLabel: string;
  /** Set on the edit page, enables "Build profile from images". */
  characterId?: string;
  canBuildProfile?: boolean;
  /** Free plan: profile builds left. `null` means unlimited. */
  buildsLeft?: number | null;
  buildsTotal?: number;
}) {
  const router = useRouter();
  const [state, formAction, pendingAction] = useActionState(action, {});
  const [submitting, startSubmit] = useTransition();
  const pending = pendingAction || submitting;
  // New-character page only: images uploaded before the character exists, attached on save.
  const [draft, setDraft] = useState<{ profile_photo: SlotImage[]; face_sheet: SlotImage[]; body_sheet: SlotImage[]; reference: SlotImage[] }>({
    profile_photo: [],
    face_sheet: [],
    body_sheet: [],
    reference: [],
  });
  const [profile, setProfile] = useState<CharacterProfile>(initial.profile ?? {});
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string>();
  const { toast, show } = useToast();

  async function build() {
    if (!characterId || buildsLeft === 0) return;
    const hasText = Object.values(profile).some((v) => v?.trim());
    if (hasText && !window.confirm("Replace the current profile text with a new one built from the images? It is saved right away.")) return;
    setBuilding(true);
    setBuildError(undefined);
    const result = await buildProfile(characterId);
    setBuilding(false);
    if (result.ok) {
      setProfile(result.profile);
      show("Profile saved. You can generate it again if you want a different take.");
    } else if (result.redirectTo) {
      router.push(result.redirectTo);
      return;
    } else {
      setBuildError(result.error);
    }
    router.refresh(); // updates "builds left"
  }

  return (
    <form
      // Submitting through a transition keeps what was typed if the save is refused (React would otherwise clear the form).
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startSubmit(() => formAction(data));
      }}
      className="flex max-w-2xl flex-col gap-5"
    >
      {toast}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={initial.name} required maxLength={80} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="always_keep">Always keep</Label>
        <Input id="always_keep" name="always_keep" defaultValue={initial.always_keep ?? ""} placeholder="e.g. gold chain" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="height">Height</Label>
          <Input id="height" name="height" defaultValue={initial.height ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weight">Weight (optional)</Label>
          <Input id="weight" name="weight" defaultValue={initial.weight ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lore">Notes</Label>
        <Textarea id="lore" name="lore" defaultValue={initial.lore ?? ""} />
      </div>

      {!characterId && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4">
          <legend className="px-2 text-sm font-medium">Images <span className="font-normal text-neutral-500">optional</span></legend>
          <p className="text-sm text-neutral-400">
            Add them now or later. Click to upload, drop a file, or paste with Ctrl+V while a box is focused. Photo metadata (location,
            device) is stripped on upload. The profile photo is only for display and is never sent to an AI model.
          </p>
          <ImageSlot label="Profile photo" slot="profile_photo" draft={{ images: draft.profile_photo, onChange: (v) => setDraft((d) => ({ ...d, profile_photo: v })) }} />
          <ImageSlot label="Face sheet" slot="face_sheet" hint="A sheet of the face from several angles, or one clear face photo." draft={{ images: draft.face_sheet, onChange: (v) => setDraft((d) => ({ ...d, face_sheet: v })) }} />
          <ImageSlot label="Body sheet" slot="body_sheet" hint="Front, back and side of the body." draft={{ images: draft.body_sheet, onChange: (v) => setDraft((d) => ({ ...d, body_sheet: v })) }} />
          <ImageSlot label="Reference images (up to 3)" slot="reference" max={3} draft={{ images: draft.reference, onChange: (v) => setDraft((d) => ({ ...d, reference: v })) }} />
          {draft.profile_photo.map((i) => <input key={i.path} type="hidden" name="image_profile_photo" value={i.path} />)}
          {draft.face_sheet.map((i) => <input key={i.path} type="hidden" name="image_face_sheet" value={i.path} />)}
          {draft.body_sheet.map((i) => <input key={i.path} type="hidden" name="image_body_sheet" value={i.path} />)}
          {draft.reference.map((i) => <input key={i.path} type="hidden" name="image_reference" value={i.path} />)}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-800 p-4">
        <legend className="px-2 text-sm font-medium">Profile</legend>
        <p className="text-sm text-neutral-400">
          The saved profile is the sole source of the character description.
          {characterId
            ? " Upload images above, then build a profile from them and edit it."
            : " Save the character, then open it to build the profile from the images with one click, or write it by hand."}
        </p>
        {characterId && (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={build} disabled={building || !canBuildProfile || buildsLeft === 0} className="self-start">
              {building ? "Building..." : "Build profile from images"}
            </Button>
            {!canBuildProfile && <p className="text-xs text-neutral-500">Upload a face sheet, body sheet or reference photo to enable this.</p>}
            {buildsLeft !== null && buildsTotal !== undefined && (
              <p className="text-xs text-neutral-500">
                Free plan: {buildsLeft} of {buildsTotal} profile generations left.
              </p>
            )}
            {buildError && <p role="alert" className="text-sm text-red-400">{buildError}</p>}
            <p className="text-xs text-neutral-500">A generated profile is saved automatically. You can edit it below and click Save character.</p>
          </div>
        )}
        {PROFILE_FIELDS.map(({ key, label, rows }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`profile_${key}`}>{label}</Label>
            <Textarea
              id={`profile_${key}`}
              name={`profile_${key}`}
              rows={rows}
              value={profile[key] ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
            />
          </div>
        ))}
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-neutral-300">
        <input type="checkbox" name="provenance" className="mt-1" required />
        I own or license any photos used for this character, or the character is invented.
      </label>

      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : submitLabel}</Button>
        <Button asChild variant="outline"><Link href="/characters">Back</Link></Button>
      </div>
    </form>
  );
}
