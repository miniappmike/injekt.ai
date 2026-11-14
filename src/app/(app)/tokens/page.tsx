import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { creditSummary } from "@/lib/billing";
import { TokensView } from "@/components/tokens-view";
import { availablePayMethods } from "@/lib/payments/available";
import { env } from "@/env";
import { inviteLink } from "@/lib/invites";
import { getInviteInfo } from "@/lib/invites-server";

export const metadata: Metadata = { title: "Tokens" };

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { supabase, user } = await requireUser();
  const { paid } = await searchParams;
  const [s, invite] = await Promise.all([creditSummary(user.id, !!user.email_confirmed_at), getInviteInfo(supabase, user.id)]);
  return (
    <TokensView
      s={s}
      emailConfirmed={!!user.email_confirmed_at}
      methods={availablePayMethods()}
      invite={{ link: inviteLink(env.NEXT_PUBLIC_APP_URL, invite.code), joined: invite.joined }}
      justPaid={!!paid}
    />
  );
}
