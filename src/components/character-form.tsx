"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_FIELDS, type CharacterProfile } from "@/lib/characters";
import type { CharacterFormState } from "@/app/(app)/characters/actions";

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
}: {
  action: (state: CharacterFormState, formData: FormData) => Promise<CharacterFormState>;
  initial?: Initial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
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

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-800 p-4">
        <legend className="px-2 text-sm font-medium">Profile</legend>
        <p className="text-sm text-neutral-400">
          The saved profile is the sole source of the character description. Photo upload and automatic
          profile building arrive in a later step; for now, write it by hand.
        </p>
        {PROFILE_FIELDS.map(({ key, label, rows }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`profile_${key}`}>{label}</Label>
            <Textarea id={`profile_${key}`} name={`profile_${key}`} rows={rows} defaultValue={initial.profile?.[key] ?? ""} />
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
