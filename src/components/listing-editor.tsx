"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminListingControls } from "@/components/admin-listing-controls";
import { UploadIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { clipboardImages, usePasteTarget } from "@/components/paste-router";
import {
  addPreviewFromCharacter,
  addPreviewUpload,
  getOrCreateDraft,
  publishListing,
  removePreview,
  reorderPreviews,
  updateListingDetails,
  updateListingPrice,
} from "@/app/(app)/characters/[id]/listing-actions";
import type { EditorListing } from "@/lib/marketplace/admin-data";
import {
  MAX_PREVIEWS,
  MAX_PREVIEW_UPLOAD_BYTES,
  centsToDollars,
  dollarsToCents,
  publishBlockers,
  suggestFromProfile,
  type ListingStatus,
} from "@/lib/marketplace/listing-input";
import type { CharacterProfile } from "@/lib/characters";

export interface OwnImage {
  which: string;
  label: string;
  url: string;
}

const STATUS: Record<ListingStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-neutral-800 text-neutral-300 ring-neutral-700" },
  available: { label: "Live on marketplace", tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  reserved: { label: "Reserved (checkout in progress)", tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  sold: { label: "Sold", tone: "bg-brand-500/15 text-brand-300 ring-brand-500/30" },
  delisted: { label: "Delisted", tone: "bg-neutral-800 text-neutral-400 ring-neutral-700" },
};

/**
 * The admin's "List on marketplace" panel for one character: price, the public profile, the preview pictures and the
 * publish button. Every change is saved by a server action that re-checks the caller is an admin.
 */
export function ListingEditor({
  characterId,
  characterName,
  listing,
  hasAssets,
  ownImages,
  profile,
}: {
  characterId: string;
  characterName: string;
  listing: EditorListing | null;
  hasAssets: boolean;
  ownImages: OwnImage[];
  profile: CharacterProfile;
}) {
  const router = useRouter();
  const { toast, show } = useToast();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  /** Runs a server action, shows its error or a toast, and reloads the page data. */
  function act<T extends { ok: boolean }>(fn: () => Promise<T | { ok: false; error: string }>, done?: string, after?: () => void) {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError((r as { error: string }).error);
      else {
        if (done) show(done);
        after?.();
        router.refresh();
      }
    });
  }

  const wrap = (children: React.ReactNode) => (
    <section id="marketplace" className="panel grid scroll-mt-28 gap-4 p-4 sm:p-5" aria-labelledby="marketplace-heading">
      <h2 id="marketplace-heading" className="text-lg font-semibold">Marketplace</h2>
      {children}
      {error && <p role="alert" className="rounded-md border border-red-800 p-3 text-sm text-red-300">{error}</p>}
      {toast}
    </section>
  );

  if (!listing) {
    return wrap(
      <>
        <p className="text-sm text-neutral-400">
          Sell {characterName} as a one-of-a-kind persona. Whoever buys her gets her own copy of the full pictures and profile, and nobody else can ever
          buy her. You set the price and choose the preview pictures people see first.
        </p>
        {!hasAssets && <p className="text-sm text-amber-300">To list her, first add a face sheet, body sheet or reference photo.</p>}
        <Button className="max-sm:w-full sm:w-fit" disabled={busy} onClick={() => act(() => getOrCreateDraft(characterId))}>
          {busy ? "Starting..." : "List on marketplace"}
        </Button>
      </>,
    );
  }

  // Re-mount the form when the saved data changes underneath it (after a save, publish or reorder).
  const formKey = `${listing.id}:${listing.status}:${listing.priceCents}:${listing.name}:${JSON.stringify(listing.publicProfile)}`;
  return wrap(
    <EditorBody
      key={formKey}
      characterId={characterId}
      listing={listing}
      hasAssets={hasAssets}
      ownImages={ownImages}
      profile={profile}
      busy={busy}
      act={act}
      setError={setError}
    />,
  );
}

type Act = <T extends { ok: boolean }>(fn: () => Promise<T | { ok: false; error: string }>, done?: string, after?: () => void) => void;

function EditorBody({
  listing,
  hasAssets,
  ownImages,
  profile,
  busy,
  act,
  setError,
}: {
  characterId: string;
  listing: EditorListing;
  hasAssets: boolean;
  ownImages: OwnImage[];
  profile: CharacterProfile;
  busy: boolean;
  act: Act;
  setError: (e: string | undefined) => void;
}) {
  const pp = listing.publicProfile;
  const [name, setName] = useState(listing.name);
  const [price, setPrice] = useState(centsToDollars(listing.priceCents));
  const [tagline, setTagline] = useState(pp.tagline ?? "");
  const [bio, setBio] = useState(pp.bio ?? "");
  const [tags, setTags] = useState<string[]>(pp.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  const sold = listing.status === "sold";
  const live = listing.status === "available";
  const locked = busy || sold;
  const priceCents = dollarsToCents(price);

  const savedTags = pp.tags ?? [];
  const dirty =
    name !== listing.name ||
    (priceCents ?? -1) !== listing.priceCents ||
    tagline !== (pp.tagline ?? "") ||
    bio !== (pp.bio ?? "") ||
    tags.length !== savedTags.length ||
    tags.some((t, i) => t !== savedTags[i]);

  // Publishing uses what is SAVED, so the button asks for a save first when there are unsaved edits.
  const blockers = publishBlockers({ hasAssets, name: listing.name, priceCents: listing.priceCents, previewCount: listing.previews.length });
  if (dirty && !blockers.length) blockers.push("Save your changes first.");
  const canPublish = !sold && !listing.holdActive && !blockers.length && !busy;

  function addTag() {
    const t = tagDraft.trim().replace(/,+$/, "").slice(0, 24);
    setTagDraft("");
    if (!t || tags.length >= 8 || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    setTags([...tags, t]);
  }

  function savePrice() {
    if (priceCents === null) return setError("Enter the price in dollars, like 29.00.");
    act(() => updateListingPrice(listing.id, priceCents), "Price saved");
  }

  function saveDetails() {
    if (priceCents === null) return setError("Enter the price in dollars, like 29.00.");
    act(() => updateListingDetails(listing.id, { name, priceCents, publicProfile: { tagline, bio, tags } }), "Saved");
  }

  function fillFromProfile() {
    const s = suggestFromProfile(profile);
    if (!s.tagline && !s.bio) return setError("Her profile is empty. Build it on this page first.");
    setError(undefined);
    setTagline(s.tagline);
    setBio(s.bio);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS[listing.status].tone}`}>{STATUS[listing.status].label}</span>
        {/* Delist / Relist right by the status. The price already has its own field below, so the inline editor is off here. */}
        {(live || listing.status === "reserved" || listing.status === "delisted") && (
          <AdminListingControls
            listingId={listing.id}
            status={listing.status}
            priceCents={listing.priceCents}
            holdActive={listing.holdActive}
            name={listing.name}
            showPrice={false}
          />
        )}
      </div>
      {listing.status === "delisted" && (
        <p className="text-xs text-neutral-400">She's off the marketplace and back on your Characters page. Press Relist to put her back, or Update listing below to refresh her copy first.</p>
      )}

      {sold && (
        <p className="rounded-md border border-neutral-700 p-3 text-sm text-neutral-300">
          Sold. This persona belongs to its buyer, so nothing here can be changed.
        </p>
      )}
      {!hasAssets && !sold && (
        <p className="rounded-md border border-amber-700 p-3 text-sm text-amber-300">
          To list her, add a face sheet, body sheet or reference photo to this character first.
        </p>
      )}

      {/* Wide screens: price and what shoppers read on the left, the pictures on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
      <div className="grid min-w-0 gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="listing-price">Price</Label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-44">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
            <Input id="listing-price" inputMode="decimal" className="h-11 pl-7" value={price} disabled={locked} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" className="h-11" disabled={locked || priceCents === null || priceCents === listing.priceCents} onClick={savePrice}>
            Save price
          </Button>
        </div>
        <p className="text-xs text-neutral-500">Applies only while unsold. Someone mid-checkout keeps the price they saw.</p>
        {listing.status === "reserved" && (
          <p className="text-xs text-amber-300">Someone is checking out right now. They will still pay the price they saw; a new price applies to everyone else.</p>
        )}
      </div>

      <fieldset disabled={locked} className="grid min-w-0 gap-3 border-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">What shoppers see</h3>
          <Button type="button" size="sm" variant="outline" onClick={fillFromProfile}>Fill from her profile</Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="listing-name">Name</Label>
          <Input id="listing-name" className="h-11" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="listing-tagline">Tagline</Label>
          <Input id="listing-tagline" className="h-11" value={tagline} maxLength={120} placeholder="One short line that sells her" onChange={(e) => setTagline(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="listing-bio">Bio</Label>
          <Textarea id="listing-bio" rows={4} value={bio} maxLength={1200} placeholder="A few sentences about her look and personality" onChange={(e) => setBio(e.target.value)} />
          <span className="text-right text-xs text-neutral-500">{bio.length}/1200</span>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="listing-tags">Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-neutral-800 py-1 pl-3 pr-1 text-xs text-neutral-200">
                {t}
                <button type="button" aria-label={`Remove tag ${t}`} className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-700 hover:text-white" onClick={() => setTags(tags.filter((x) => x !== t))}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <Input
            id="listing-tags"
            className="h-11"
            value={tagDraft}
            placeholder={tags.length >= 8 ? "That's the most tags (8)" : "Type a tag and press Enter"}
            disabled={tags.length >= 8}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>
        <Button type="button" variant="secondary" className="h-11 max-sm:w-full sm:w-fit" disabled={!dirty || busy} onClick={saveDetails}>
          {busy ? "Saving..." : "Save changes"}
        </Button>
      </fieldset>

      </div>
      <div className="min-w-0">
        <PreviewPicker listing={listing} ownImages={ownImages} locked={locked} busy={busy} act={act} setError={setError} />
      </div>
      </div>

      {!sold && (
        <div className="grid gap-2 border-t border-neutral-800 pt-4">
          <Button className="h-11 max-sm:w-full sm:w-fit" disabled={!canPublish} onClick={() => act(() => publishListing(listing.id), live ? "Listing updated" : "Published to the marketplace")}>
            {busy ? "Working..." : live ? "Update listing" : "Publish to marketplace"}
          </Button>
          {listing.holdActive && <p className="text-xs text-amber-300">You can update the listing once the checkout finishes or times out.</p>}
          {!canPublish && !listing.holdActive && blockers.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-neutral-400">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          <p className="text-xs text-neutral-500">
            {live ? "Updating takes a fresh copy of her current pictures and profile for the buyer." : "Publishing saves a private copy of her full-size pictures and profile for whoever buys her."}
          </p>
        </div>
      )}
    </>
  );
}

function PreviewPicker({
  listing,
  ownImages,
  locked,
  busy,
  act,
  setError,
}: {
  listing: EditorListing;
  ownImages: OwnImage[];
  locked: boolean;
  busy: boolean;
  act: Act;
  setError: (e: string | undefined) => void;
}) {
  const previews = listing.previews;
  const input = useRef<HTMLInputElement>(null);
  const full = previews.length >= MAX_PREVIEWS;
  const ids = useMemo(() => previews.map((p) => p.id), [previews]);

  const box = useRef<HTMLDivElement>(null);
  usePasteTarget(box, (f) => upload(f), busy);
  function upload(files: FileList | File[] | null) {
    const file = files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_PREVIEW_UPLOAD_BYTES) return setError("That image is over 15 MB.");
    const fd = new FormData();
    fd.set("file", file);
    act(() => addPreviewUpload(listing.id, fd), "Preview added", () => input.current && (input.current.value = ""));
  }

  function move(i: number, by: -1 | 1) {
    const next = [...ids];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    act(() => reorderPreviews(listing.id, next));
  }

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm font-semibold">Preview pictures ({previews.length}/{MAX_PREVIEWS})</h3>
        <p className="text-xs text-neutral-500">
          Shoppers only see these small, watermarked copies. The full-size pictures go to the buyer. The first picture is the cover.
        </p>
      </div>

      {previews.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Preview ${i + 1}`} className="aspect-[3/4] w-full object-cover object-top" />
              {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">Cover</span>}
              {!locked && (
                <>
                  <button type="button" aria-label={`Remove preview ${i + 1}`} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-950/80 text-lg text-white ring-1 ring-white/10 hover:bg-red-600" onClick={() => act(() => removePreview(p.id))}>
                    ×
                  </button>
                  <div className="flex justify-between gap-2 p-2">
                    <Button type="button" size="sm" variant="secondary" className="h-9 flex-1" disabled={i === 0} aria-label={`Move preview ${i + 1} earlier`} onClick={() => move(i, -1)}>←</Button>
                    <Button type="button" size="sm" variant="secondary" className="h-9 flex-1" disabled={i === previews.length - 1} aria-label={`Move preview ${i + 1} later`} onClick={() => move(i, 1)}>→</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && !full && (
        <>
          {ownImages.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-neutral-300">Add from her images (tap one)</span>
              <div className="flex flex-wrap gap-2">
                {ownImages.map((img) => (
                  <button
                    key={img.which}
                    type="button"
                    disabled={busy}
                    aria-label={`Add ${img.label} as a preview`}
                    title={img.label}
                    className="relative h-20 w-16 overflow-hidden rounded-lg border border-neutral-700 hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-50"
                    onClick={() => act(() => addPreviewFromCharacter(listing.id, img.which), "Preview added")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover object-top" />
                    <span className="absolute inset-x-0 bottom-0 bg-neutral-950/80 px-1 py-0.5 text-[9px] leading-tight text-neutral-200">{img.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            ref={box}
            className="dropzone flex flex-col items-center gap-2 p-4 text-center"
            tabIndex={0}
            onPaste={(e) => upload(clipboardImages(e.clipboardData))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files);
            }}
          >
            <UploadIcon className="h-5 w-5 text-neutral-400" />
            <p className="text-xs text-neutral-400">Drop a picture here, paste one with Ctrl+V, or choose a file. JPEG, PNG or WebP, up to 15 MB.</p>
            <Button type="button" variant="secondary" className="h-11 max-sm:w-full" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Working..." : "Upload a picture"}
            </Button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files)} />
          </div>
        </>
      )}
      {full && !locked && <p className="text-xs text-neutral-400">That's the most previews ({MAX_PREVIEWS}). Remove one to add another.</p>}
    </div>
  );
}
