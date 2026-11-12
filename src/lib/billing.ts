import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { loadProfile } from "@/lib/entitlements";
import { creditBalance } from "@/lib/credits";

export interface CreditSummary {
  balance: number;
  /** Pro month tokens left, and when they run out. */
  monthly: { left: number; expiresAt: string | null };
  bought: number;
  free: number;
  plan: "free" | "pro" | "admin";
  proUntil: string | null;
  manualPro: boolean;
  activity: { at: string; delta: number; label: string }[];
  /** False before migration 0023. */
  ready: boolean;
}

const SPEND_LABELS: Record<string, string> = { prompt: "Prompt", profile: "Profile build" };
const spendLabel = (reason: string) => SPEND_LABELS[reason] ?? (reason.startsWith("image:") ? "Image" : reason);
const LOT_LABELS: Record<string, string> = { signup: "Free tokens", pro: "Pro month", topup: "Token pack", admin: "Added by ModelSpawn" };

/** Everything the Tokens page shows: the balance split by where it came from, and recent activity. */
export async function creditSummary(userId: string, emailConfirmed: boolean): Promise<CreditSummary> {
  const db = adminClient();
  const [balance, profile] = await Promise.all([creditBalance(userId, { emailConfirmed }), loadProfile(userId)]);
  const plan = profile?.is_admin ? "admin" : profile?.pro ? "pro" : "free";
  const base = { plan, proUntil: profile?.proUntil ?? null, manualPro: profile?.manualPro ?? false } as const;
  if (balance === null) return { ...base, balance: 0, monthly: { left: 0, expiresAt: null }, bought: 0, free: 0, activity: [], ready: false };

  const now = new Date().toISOString();
  const [{ data: lots }, { data: spends }] = await Promise.all([
    db.from("credit_lots").select("source, amount, remaining, expires_at, created_at, note").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    db.from("credit_spends").select("amount, reason, created_at, refunded_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
  ]);
  const live = (lots ?? []).filter((l) => l.remaining > 0 && (!l.expires_at || l.expires_at > now));
  const sum = (src: string) => live.filter((l) => l.source === src).reduce((n, l) => n + (l.remaining as number), 0);
  const monthlyLots = live.filter((l) => l.source === "pro").sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));

  const activity = [
    ...(lots ?? []).map((l) => ({ at: l.created_at as string, delta: l.amount as number, label: `${LOT_LABELS[l.source as string] ?? "Tokens"}${l.note ? ` (${l.note})` : ""}` })),
    ...(spends ?? []).map((s) => ({ at: s.created_at as string, delta: s.refunded_at ? 0 : -(s.amount as number), label: `${spendLabel(s.reason as string)}${s.refunded_at ? " · refunded" : ""}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);

  return {
    ...base,
    balance,
    monthly: { left: sum("pro"), expiresAt: (monthlyLots[0]?.expires_at as string | undefined) ?? null },
    bought: sum("topup") + sum("admin"),
    free: sum("signup"),
    activity,
    ready: true,
  };
}
