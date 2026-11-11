import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { creditSummary } from "@/lib/billing";
import { TokensView } from "@/components/tokens-view";

export const metadata: Metadata = { title: "Tokens" };

export default async function TokensPage() {
  const { user } = await requireUser();
  const s = await creditSummary(user.id, !!user.email_confirmed_at);
  return <TokensView s={s} emailConfirmed={!!user.email_confirmed_at} />;
}
