import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { creditSummary } from "@/lib/billing";
import { TokensView } from "@/components/tokens-view";
import { availablePayMethods } from "@/lib/payments/available";

export const metadata: Metadata = { title: "Tokens" };

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { user } = await requireUser();
  const { paid } = await searchParams;
  const s = await creditSummary(user.id, !!user.email_confirmed_at);
  return <TokensView s={s} emailConfirmed={!!user.email_confirmed_at} methods={availablePayMethods()} justPaid={!!paid} />;
}
