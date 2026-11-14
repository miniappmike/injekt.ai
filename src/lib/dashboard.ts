import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { characterAvatars } from "@/lib/character-avatars";
import { creditBalance } from "@/lib/credits";
import { loadGenerationState } from "@/lib/generation-access";
import { listGenerations } from "@/lib/generation-list";
import type { Actor } from "@/lib/generation";
import { listPublicListings, marketplaceCounts } from "@/lib/marketplace/public-data";
import { getListingStats } from "@/lib/marketplace/stats";
import { MAX_REFERENCE_PHOTOS } from "@/lib/reference-limits";

import { STEP_ORDER, type DashCharacter, type DashImage, type StepKey } from "@/lib/dashboard-types";

export type { DashCharacter, DashImage, StepKey };
export { STEP_ORDER };

export interface Dashboard {
  characters: DashCharacter[];
  /** The character worked on most recently (the one the last image was made for), else the first. */
  focusId: string | null;
  recent: DashImage[];
  imagesThisMonth: number;
  imagesThisWeek: number;
  tokens: number | null;
  generation: boolean;
  /** Which first steps are done. When all are, the next-step tile gives way to the quick tools. */
  steps: Record<StepKey, boolean>;
  trending: { id: string; name: string; tagline: string; image: string | null; rank: number | null } | null;
  market: { available: number; sold: number };
}

const count = (r: { count: number | null }) => r.count ?? 0;

/** Everything the home dashboard shows, read in one go. A part that fails shows as empty, never as an error page. */
export async function loadDashboard(supabase: SupabaseClient, user: Actor & { email_confirmed_at?: string | null }): Promise<Dashboard> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const done = () => supabase.from("generations").select("id", { count: "exact", head: true }).eq("status", "complete");

  const [chars, lastFor, images, month, week, ever, likeness, tokens, gen, listings, market] = await Promise.all([
    supabase.from("characters").select("id, name, profile_photo_path, face_sheet_path, body_sheet_path, reference_paths").order("name"),
    supabase.from("generations").select("character_id").not("character_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    listGenerations(supabase, user, 12).catch(() => []),
    done().gte("created_at", monthStart),
    done().gte("created_at", weekStart),
    done(),
    supabase.from("api_ledger").select("id", { count: "exact", head: true }).eq("feature", "likeness").eq("status", "succeeded"),
    creditBalance(user.id, { emailConfirmed: !!user.email_confirmed_at }).catch(() => null),
    loadGenerationState(supabase, user.id),
    listPublicListings().catch(() => []),
    marketplaceCounts().catch(() => ({ available: 0, sold: 0 })),
  ]);

  const rows = chars.data ?? [];
  const photos = await characterAvatars(supabase, rows);
  const characters: DashCharacter[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    photo: photos.get(c.id) ?? null,
    ready: !!c.face_sheet_path && !!c.body_sheet_path,
    refs: Math.min(MAX_REFERENCE_PHOTOS, (c.reference_paths ?? []).length),
    maxRefs: MAX_REFERENCE_PHOTOS,
  }));
  const last = lastFor.data?.character_id as string | undefined;
  const focusId = characters.find((c) => c.id === last)?.id ?? characters.find((c) => c.ready)?.id ?? characters[0]?.id ?? null;

  // The persona still for sale with the best Virality Rank; with no ranks yet, the newest one.
  const forSale = listings.filter((l) => l.state === "available");
  const stats = forSale.length ? await getListingStats(forSale.map((l) => l.id)) : {};
  const rankOf = (id: string) => stats[id]?.rank ?? Number.POSITIVE_INFINITY;
  const top = [...forSale].sort((a, b) => rankOf(a.id) - rankOf(b.id))[0];

  return {
    characters,
    focusId,
    recent: images
      .filter((i) => i.state === "ready" && i.previewUrl && i.expiresAt)
      .slice(0, 5)
      .map((i) => ({ id: i.id, url: i.previewUrl as string, downloadUrl: i.downloadUrl, prompt: i.prompt, expiresAt: i.expiresAt as string })),
    imagesThisMonth: count(month),
    imagesThisWeek: count(week),
    tokens,
    generation: gen.enabled,
    steps: {
      model: rows.length > 0,
      sheets: rows.some((c) => c.face_sheet_path && c.body_sheet_path),
      image: count(ever) > 0,
      likeness: count(likeness) > 0,
      // Pinned images are kept in <user>/pinned/<character>/.
      pin: rows.some((c) => ((c.reference_paths ?? []) as string[]).some((p) => p.includes("/pinned/"))),
    },
    trending: top ? { id: top.id, name: top.name, tagline: top.tagline, image: top.images[0]?.url ?? null, rank: stats[top.id]?.rank ?? null } : null,
    market,
  };
}
