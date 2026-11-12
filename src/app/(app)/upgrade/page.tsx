import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { loadProfile } from "@/lib/entitlements";
import { bonusCheck } from "@/lib/orders";
import { BONUS_BLOCK_TEXT } from "@/lib/orders-core";
import { UpgradeView } from "@/components/upgrade-view";
import { availablePayMethods } from "@/lib/payments/available";

export const metadata: Metadata = { title: "Upgrade to Pro" };

export default async function UpgradePage() {
  const { user } = await requireUser();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const [profile, bonus] = await Promise.all([loadProfile(user.id), bonusCheck(user, { ip }).catch(() => ({ ok: true as const }))]);
  return (
    <UpgradeView
      plan={profile?.is_admin ? "admin" : profile?.pro ? "pro" : "free"}
      proUntil={profile?.proUntil ?? null}
      bonusNote={bonus.ok ? null : BONUS_BLOCK_TEXT[bonus.reason]}
      methods={availablePayMethods()}
    />
  );
}
