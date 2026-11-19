import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CharacterForm } from "@/components/character-form";
import { ImageSlot } from "@/components/image-slot";
import { requireUser } from "@/lib/auth";
import { signedUrlMap } from "@/lib/media-urls";
import { entitlements } from "@/lib/entitlements";
import { hasOwnAiKey } from "@/lib/daily-limits";
import { PROFILE_BUILD_CREDITS } from "@/lib/plans";
import { FREE_LIMITS } from "@/lib/limits";
import { referenceList } from "@/lib/character-images";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";
import { selectCharacter } from "@/lib/sheet-pack";
import { MAX_X_REFERENCES } from "@/lib/reference-limits";
import type { CharacterProfile } from "@/lib/characters";
import { ListingEditor, type OwnImage } from "@/components/listing-editor";
import { loadEditorListing } from "@/lib/marketplace/admin-data";
import { updateCharacter } from "../actions";
import { DeleteCharacterButton } from "@/components/character-card-actions";
import { PhoneCard } from "@/components/phone-card";
import { loadPhone } from "@/lib/character-phone";
import { InfoTip } from "@/components/info-tip";

// The profile builder calls a vision model from this page.
export const maxDuration = 60;

interface CharacterRow {
  id: string;
  name: string;
  always_keep: string | null;
  height: string | null;
  weight: string | null;
  lore: string | null;
  profile: unknown;
  profile_photo_path: string | null;
  face_sheet_path: string | null;
  body_sheet_path: string | null;
  reference_paths: string[];
  sheet_pack?: unknown;
}

const NOTICES: Record<string, { text: string; good: boolean }> = {
  saved: { text: "Character saved.", good: true },
  built: { text: "Character saved and profile generated. Check it below, edit anything, or generate it again.", good: true },
  no_images: { text: "Character saved. Add a face sheet, body sheet or reference image, then build the profile.", good: false },
  no_key: { text: "Character saved, but the profile wasn't built because no API key is set up yet. Add one under API keys, then click Build profile from images.", good: false },
  limit: { text: "Character saved, but you've used all your free profile generations.", good: false },
  failed: { text: "Character saved, but the profile couldn't be built this time. Click Build profile from images to try again and see why.", good: false },
};

export default async function EditCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; from?: string; list?: string }>;
}) {
  const { id } = await params;
  const { notice, from, list: listParam } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const { supabase, user } = await requireUser();
  const c = await selectCharacter<CharacterRow>(
    supabase,
    id,
    "id, name, always_keep, height, weight, lore, profile, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths, sheet_pack",
  );
  if (!c) notFound();

  // Profile builds cost credits on the platform's key (free with their own key on Pro).
  const buildCredits = (await hasOwnAiKey(supabase, user.id)) ? null : PROFILE_BUILD_CREDITS;
  // X Reference (placeholder): read on its own, so the page still opens before migration 0036/0037 is run.
  const { data: xRow } = await supabase.from("characters").select("x_reference_paths").eq("id", id).maybeSingle();
  const xRefs = ((xRow as { x_reference_paths?: string[] | null } | null)?.x_reference_paths ?? []).slice(0, MAX_X_REFERENCES);
  const phone = await loadPhone(supabase, c.id);
  const urls = await signedUrlMap(supabase, [c.profile_photo_path, c.face_sheet_path, c.body_sheet_path, ...c.reference_paths, ...xRefs, phone.path]);
  const imgs = (paths: (string | null)[]) => paths.filter((p): p is string => !!p && !!urls[p]).map((p) => ({ path: p, url: urls[p] }));

  // The marketplace panel is for admins only. The listing data is read with the service role, after this admin check.
  const isAdmin = (await entitlements.planOf(user.id)) === "admin";
  const listing = isAdmin ? await loadEditorListing(c.id) : null;
  // A draft that was never published doesn't take over her page: Edit is her normal profile. The marketplace panel shows
  // when the person pressed List (?list=1) or the listing is live, reserved, delisted or sold.
  const showListing = isAdmin && (listParam === "1" || (!!listing && listing.status !== "draft"));
  const ownImages: OwnImage[] = [
    { which: "profile_photo", label: "Profile photo", path: c.profile_photo_path },
    { which: "face_sheet", label: "Face sheet", path: c.face_sheet_path },
    { which: "body_sheet", label: "Body sheet", path: c.body_sheet_path },
    ...c.reference_paths.slice(0, 3).map((path, i) => ({ which: `reference:${i}`, label: `Reference ${i + 1}`, path })),
  ].flatMap((x) => (x.path && urls[x.path] ? [{ which: x.which, label: x.label, url: urls[x.path] }] : []));

  const profile = (c.profile ?? {}) as CharacterProfile;
  const avatar = c.profile_photo_path ? urls[c.profile_photo_path] : c.reference_paths[0] ? urls[c.reference_paths[0]] : undefined;
  const chips: { label: string; on: boolean }[] = [
    { label: "Face sheet", on: !!c.face_sheet_path },
    { label: "Body sheet", on: !!c.body_sheet_path },
    { label: `${c.reference_paths.length}/${MAX_REFERENCE_PHOTOS} references`, on: c.reference_paths.length > 0 },
    { label: "Phone", on: !!(phone.description || phone.path) },
  ];

  const cover = c.reference_paths[0] ? urls[c.reference_paths[0]] : avatar;
  const gallery = [
    ...c.reference_paths.map((p, i) => ({ path: p, label: i === 0 ? "Cover" : `Reference ${i + 1}` })),
  ].filter((x): x is { path: string; label: string } => !!x.path && !!urls[x.path]);
  const strip = gallery.length ? (
    <ul className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]" aria-label={`${c.name}'s images, scroll sideways`}>
      {gallery.map((g) => (
        <li key={g.path} className="group relative w-36 shrink-0 snap-start overflow-hidden rounded-2xl ring-1 ring-white/10 sm:w-44">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[g.path]} alt={g.label} className="aspect-[3/4] w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-xs font-semibold text-white">{g.label}</span>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Her header: picture, name, identity line, what she has, and the quick actions. */}
      <section className="panel relative overflow-hidden p-5 sm:p-7">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgb(232_38_94/0.18),transparent_55%),radial-gradient(circle_at_100%_100%,rgb(91_91_246/0.12),transparent_55%)]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover object-top ring-2 ring-neutral-950 shadow-[0_0_0_3px_rgb(232_38_94/0.55)] sm:h-28 sm:w-28" />
          ) : (
            <span aria-hidden="true" className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-iris-500 font-display text-4xl font-bold text-white sm:h-28 sm:w-28">{c.name.charAt(0)}</span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Edit character</p>
            <h1 className="truncate font-display text-3xl font-bold text-neutral-50 sm:text-4xl">{c.name}</h1>
            {profile.identity_line && <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-neutral-400">{profile.identity_line}</p>}
            <ul className="mt-1 flex flex-wrap gap-2">
              {chips.map((x) => (
                <li key={x.label} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${x.on ? "bg-brand-500/15 text-brand-200 ring-brand-500/40" : "bg-neutral-800/70 text-neutral-500 ring-neutral-700"}`}>
                  {x.on ? "✓ " : ""}{x.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
            <Button asChild size="sm"><Link href={`/inject?character=${c.id}`}>Use in Inject</Link></Button>
            <Button asChild size="sm" variant="secondary"><Link href={`/director?character=${c.id}`}>Director</Link></Button>
            <DeleteCharacterButton id={c.id} name={c.name} />
          </div>
        </div>
        {strip && <div className="relative mt-6">{strip}</div>}
      </section>

      {banner && (
        <p role="status" className={`rounded-xl border p-3 text-sm ${banner.good ? "border-emerald-800 bg-emerald-500/5 text-emerald-300" : "border-amber-700 bg-amber-500/5 text-amber-300"}`}>
          {banner.text}
        </p>
      )}

      {showListing && (
        <ListingEditor
          characterId={c.id}
          characterName={c.name}
          listing={listing}
          hasAssets={!!c.face_sheet_path || !!c.body_sheet_path || c.reference_paths.length > 0}
          ownImages={ownImages}
          profile={profile}
        />
      )}

      {/* Wide screens: her images on the left, her details and profile on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card title="Identity" sub="Every tool keeps her looking like these. Click a picture to see it full size.">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <ImageSlot label="Profile photo" slot="profile_photo" characterId={c.id} images={imgs([c.profile_photo_path])} hint="Display only, never sent to an AI model." />
              <ImageSlot label="Face sheet" slot="face_sheet" characterId={c.id} images={imgs([c.face_sheet_path])} hint="Her face from several angles." />
              <ImageSlot label="Body sheet" slot="body_sheet" characterId={c.id} images={imgs([c.body_sheet_path])} hint="Front, back and side." />
            </div>
            {(!c.face_sheet_path || !c.body_sheet_path) && (
              <p className="text-sm text-neutral-400">
                No sheets yet? <Link href={`/reference-sheet?character=${c.id}`} className="font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200">Make them from photos</Link>.
              </p>
            )}
          </Card>

          <Card title="Reference images" sub={`Up to ${MAX_REFERENCE_PHOTOS}. The first one is her cover.`}>
            <ImageSlot label="Reference photos" slot="reference" characterId={c.id} images={imgs(c.reference_paths)} max={MAX_REFERENCE_PHOTOS} />
            {c.reference_paths.length === 0 && (
              <p className="text-sm text-neutral-400">
                Generate some: <Link href={`/inject?character=${c.id}`} className="font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200">put {c.name} into a photo</Link> or describe a shot in{" "}
                <Link href={`/director?character=${c.id}`} className="font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200">Director</Link>, then press Pin It.
              </p>
            )}
          </Card>

          <Card title="Her phone" sub="Used whenever a phone appears in a shot.">
            <PhoneCard characterId={c.id} name={c.name} description={phone.description} images={imgs([phone.path])} />
          </Card>

          <Card
            title="X References"
            sub={`Up to ${MAX_X_REFERENCES}. Sent to the AI when X references is ticked in Inject or Direct swap.`}
            tip={<InfoTip label="About X References">What X References are for, and a guide on using them, are on our Discord.</InfoTip>}
          >
            <ImageSlot label="X References" slot="x_reference" characterId={c.id} images={imgs(xRefs)} max={MAX_X_REFERENCES} />
            <Button asChild variant="secondary" className="w-fit">
              <a href="https://discord.gg/9tV5FfMvW4" target="_blank" rel="noopener noreferrer">Join the Discord for the guide</a>
            </Button>
          </Card>
        </div>

        <Card title="Details and profile" sub="Every prompt describes her from this." className="lg:sticky lg:top-28">
          <CharacterForm
            action={updateCharacter.bind(null, c.id)}
            initial={{ ...c, profile }}
            submitLabel="Save character"
            characterId={c.id}
            canBuildProfile={referenceList(c).length > 0}
            buildCredits={buildCredits}
            buildsTotal={FREE_LIMITS.profile_builds}
            fromWizard={from === "wizard"}
          />
        </Card>
      </div>
    </div>
  );
}

/** One section of her page: a titled panel with even spacing. */
function Card({ title, sub, tip, className = "", children }: { title: string; sub?: string; tip?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`panel flex flex-col gap-4 p-5 sm:p-6 ${className}`}>
      <header className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-neutral-50">
          <span aria-hidden="true" className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-iris-500" />
          {title}
          {tip}
        </h2>
        {sub && <p className="text-sm text-neutral-400">{sub}</p>}
      </header>
      {children}
    </section>
  );
}
