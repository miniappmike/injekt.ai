"use client";

import { usageChanged } from "@/lib/panel-events";
import { TokenCost } from "@/components/token-icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
  buildCredits = null,
  buildsTotal,
  fromWizard = false,
}: {
  action: (state: CharacterFormState, formData: FormData) => Promise<CharacterFormState>;
  initial?: Initial;
  submitLabel: string;
  /** Set on the edit page, enables "Build profile from images". */
  characterId?: string;
  canBuildProfile?: boolean;
  /** Free plan: profile builds left. `null` means unlimited. */
  buildsLeft?: number | null;
  /** What a profile build costs on the platform's key; null with their own key. */
  buildCredits?: number | null;
  buildsTotal?: number;
  /** Arrived straight from the Create Model wizard: point at Build profile, the last step. */
  fromWizard?: boolean;
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
  const canBuildDraft = draft.face_sheet.length + draft.body_sheet.length + draft.reference.length > 0;
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string>();
  const { toast, show } = useToast();
  // From the wizard: a toast and a glowing Build profile button (until it's pressed), scrolled into view.
  const wizardToast = useToast(8000);
  const [nudge, setNudge] = useState(false);
  const buildRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!fromWizard || !characterId) return;
    wizardToast.show("Last step: tap Build profile to lock in her identity.");
    setNudge(true);
    buildRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // A refresh shouldn't show it again.
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromWizard, characterId]);

  async function build() {
    if (!characterId || buildsLeft === 0) return;
    setNudge(false);
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
    usageChanged(); // the tokens in the header
    router.refresh();
  }

  return (
    <form
      // Submitting through a transition keeps what was typed if the save is refused (React would otherwise clear the form).
      onSubmit={(e) => {
        e.preventDefault();
        // Passing the submitter includes the clicked button, which is how "Save and build profile" is told apart.
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startSubmit(() => formAction(data));
      }}
      className="flex max-w-2xl flex-col gap-5 lg:max-w-none"
    >
      {toast}
      {wizardToast.toast}
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={initial.name} required maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="always_keep">Always keep</Label>
          <Input id="always_keep" name="always_keep" defaultValue={initial.always_keep ?? ""} placeholder="e.g. gold chain" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="height">Height</Label>
          <Input id="height" name="height" defaultValue={initial.height ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weight">Weight</Label>
          <Input id="weight" name="weight" defaultValue={initial.weight ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lore">Notes</Label>
        <Textarea id="lore" name="lore" defaultValue={initial.lore ?? ""} />
      </div>

      {!characterId && (
        <fieldset className="panel flex flex-col gap-3 p-5">
          <legend className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-0.5 text-sm font-semibold">Images <span className="font-normal text-neutral-500">optional</span></legend>
          <p className="text-sm text-neutral-400">Add them now or later: upload, drop or paste. Photo metadata (location, device) is stripped on upload.</p>
          <ImageSlot label="Profile photo" slot="profile_photo" hint="For display only, never sent to an AI model." draft={{ images: draft.profile_photo, onChange: (v) => setDraft((d) => ({ ...d, profile_photo: v })) }} />
          <ImageSlot label="Face sheet" slot="face_sheet" hint="A sheet of the face from several angles, or one clear face photo." draft={{ images: draft.face_sheet, onChange: (v) => setDraft((d) => ({ ...d, face_sheet: v })) }} />
          <ImageSlot label="Body sheet" slot="body_sheet" hint="Front, back and side of the body." draft={{ images: draft.body_sheet, onChange: (v) => setDraft((d) => ({ ...d, body_sheet: v })) }} />
          <ImageSlot label="Reference images (up to 3)" slot="reference" max={3} draft={{ images: draft.reference, onChange: (v) => setDraft((d) => ({ ...d, reference: v })) }} />
          {draft.profile_photo.map((i) => <input key={i.path} type="hidden" name="image_profile_photo" value={i.path} />)}
          {draft.face_sheet.map((i) => <input key={i.path} type="hidden" name="image_face_sheet" value={i.path} />)}
          {draft.body_sheet.map((i) => <input key={i.path} type="hidden" name="image_body_sheet" value={i.path} />)}
          {draft.reference.map((i) => <input key={i.path} type="hidden" name="image_reference" value={i.path} />)}
        </fieldset>
      )}

      <fieldset className="panel flex flex-col gap-4 p-5">
        <legend className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-0.5 text-sm font-semibold">Profile</legend>
        <p className="text-sm text-neutral-400">
          {characterId
            ? "Every prompt describes her from this profile. Build it from her images (it is saved straight away), then edit anything."
            : "Every prompt describes her from this profile. It is built from her images when you press Save and build profile."}
        </p>
        {characterId && (
          <div className="flex flex-col gap-2">
            <Button
              ref={buildRef}
              type="button"
              variant={nudge ? "default" : "secondary"}
              onClick={build}
              disabled={building || !canBuildProfile || buildsLeft === 0}
              className={`self-start ${nudge ? "animate-pulse ring-2 ring-brand-400/70 ring-offset-2 ring-offset-neutral-950" : ""}`}
            >
              {building ? "Building..." : <>Build profile from images{buildCredits ? <TokenCost n={buildCredits} onPink={nudge} /> : null}</>}
            </Button>
            {!canBuildProfile && <p className="text-xs text-neutral-500">Upload a face sheet, body sheet or reference photo to enable this.</p>}
            {buildsLeft !== null && buildsTotal !== undefined && (
              <p className="text-xs text-neutral-500">
                Free plan: {buildsLeft} of {buildsTotal} profile generations left.
              </p>
            )}
            {buildError && <p role="alert" className="text-sm text-red-400">{buildError}</p>}
          </div>
        )}
        {/* A new character's profile is normally built from her images, so writing it by hand is tucked away. */}
        <details open={!!characterId} className="group">
          <summary className={characterId ? "hidden" : "cursor-pointer text-sm text-neutral-400 hover:text-neutral-200"}>Write it by hand instead</summary>
          <div className="flex flex-col gap-4 group-open:mt-3">
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
          </div>
        </details>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-neutral-300">
        <input type="checkbox" name="provenance" className="mt-1" required />
        I own or license any photos used for this character, or the character is invented.
      </label>

      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      {!characterId && !canBuildDraft && (
        <p className="text-xs text-neutral-500">Add a face sheet, body sheet or reference image to save and build a profile in one step.</p>
      )}
      {!characterId && buildsLeft !== null && buildsTotal !== undefined && (
        <p className="text-xs text-neutral-500">Free plan: {buildsLeft} of {buildsTotal} profile generations left.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : submitLabel}</Button>
        {!characterId && (
          <Button type="submit" name="build" value="1" variant="secondary" disabled={pending || !canBuildDraft || buildsLeft === 0}>
            {pending ? "Working..." : <>Save and build profile{buildCredits ? <TokenCost n={buildCredits} /> : null}</>}
          </Button>
        )}
        <Button asChild variant="outline"><Link href="/characters">Back</Link></Button>
      </div>
    </form>
  );
}
