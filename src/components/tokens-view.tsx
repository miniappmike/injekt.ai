import Link from "next/link";
import type { PayMethods } from "@/lib/payments/methods";
import type { CreditSummary } from "@/lib/billing";
import { CREDIT_PACKS, IMAGE_CREDITS, PRO, PROFILE_BUILD_CREDITS, PROMPT_CREDITS } from "@/lib/plans";
import { BuyPacks } from "@/components/buy-packs";
import { TokenIcon } from "@/components/token-icon";
import { ProBadge } from "@/components/pro-badge";
import { InviteCard } from "@/components/invite-card";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** The Tokens page: the balance by where it came from, the packs to buy, what things cost, and recent activity. */
export function TokensView({ s, emailConfirmed, methods, invite, justPaid = false }: { s: CreditSummary; emailConfirmed: boolean; methods: PayMethods; invite: { link: string; joined: number }; justPaid?: boolean }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Tokens</h1>
          <p className="mt-1 text-sm text-neutral-400">Top up any time. Tokens you buy never expire.</p>
        </div>
        {s.plan === "free" && (
          <Link href="/upgrade" className="flex items-center gap-2 rounded-xl border border-[#f92776]/50 bg-[#f92776]/10 px-3.5 py-2 text-sm font-semibold text-[#ff8fc0] transition hover:bg-[#f92776]/20">
            <ProBadge /> Get {PRO.monthlyCredits} tokens a month with Pro →
          </Link>
        )}
      </div>

      {justPaid && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Thanks! Your payment is on its way. Tokens and Pro are added as soon as it&apos;s confirmed: usually within a few minutes for crypto. Refresh this page to see them.
        </p>
      )}
      <section className="panel grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center" aria-label="Your balance">
        <div className="flex items-center gap-3">
          <TokenIcon className="h-12 w-12 drop-shadow-[0_6px_18px_rgb(249_39_118/0.45)]" />
          <div>
            <p className="font-display text-4xl font-bold tabular-nums text-neutral-50">{s.balance.toLocaleString()}</p>
            <p className="text-sm text-neutral-400">tokens to spend</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-sm sm:border-l sm:border-neutral-800 sm:pl-5">
          <div>
            <dt className="text-neutral-500">Pro month</dt>
            <dd className="font-semibold tabular-nums text-neutral-100">{s.monthly.left}</dd>
            {s.monthly.expiresAt && s.monthly.left > 0 && <dd className="text-xs text-amber-300/90">expire {day(s.monthly.expiresAt)}</dd>}
          </div>
          <div>
            <dt className="text-neutral-500">Bought</dt>
            <dd className="font-semibold tabular-nums text-neutral-100">{s.bought}</dd>
            <dd className="text-xs text-neutral-500">never expire</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Free</dt>
            <dd className="font-semibold tabular-nums text-neutral-100">{s.free}</dd>
          </div>
        </dl>
        {!s.ready && <p className="text-sm text-amber-300 sm:col-span-2">Tokens aren&apos;t switched on yet (run migration 0023 in Supabase).</p>}
        {s.ready && !emailConfirmed && <p className="text-sm text-amber-300 sm:col-span-2">Confirm your email to get your free tokens.</p>}
      </section>

      <InviteCard link={invite.link} joined={invite.joined} />

      <section aria-labelledby="packs-title" className="flex flex-col gap-3">
        <h2 id="packs-title" className="font-display text-lg font-bold text-neutral-50">Buy tokens</h2>
        <BuyPacks packs={[...CREDIT_PACKS]} methods={methods} />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-5" aria-labelledby="costs-title">
          <h2 id="costs-title" className="font-display text-base font-bold text-neutral-50">What things cost</h2>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-neutral-800/70">
              {(["1k", "1.5k", "2k"] as const).map((r) => (
                <tr key={r}><td className="py-2 text-neutral-300">Image at {r}</td><td className="py-2 text-right tabular-nums text-neutral-100">{IMAGE_CREDITS[r]} tokens</td></tr>
              ))}
              <tr><td className="py-2 text-neutral-300">Prompt (Inject, variations, carousel)</td><td className="py-2 text-right tabular-nums text-neutral-100">{PROMPT_CREDITS} token</td></tr>
              <tr><td className="py-2 text-neutral-300">Build profile</td><td className="py-2 text-right tabular-nums text-neutral-100">{PROFILE_BUILD_CREDITS} tokens</td></tr>
              <tr><td className="py-2 text-neutral-300">Likeness check, copying prompts</td><td className="py-2 text-right text-emerald-300">Free</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-neutral-500">A failed image gives its tokens back. On Pro, anything that runs on your own key costs no tokens.</p>
        </section>

        <section className="panel p-5" aria-labelledby="activity-title">
          <h2 id="activity-title" className="font-display text-base font-bold text-neutral-50">Recent activity</h2>
          {s.activity.length ? (
            <ul className="mt-3 flex max-h-72 flex-col divide-y divide-neutral-800/70 overflow-y-auto text-sm">
              {s.activity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-neutral-300">{a.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-neutral-500">{day(a.at)}</span>
                    <span className={`w-12 text-right font-semibold tabular-nums ${a.delta > 0 ? "text-emerald-300" : a.delta < 0 ? "text-neutral-200" : "text-neutral-500"}`}>
                      {a.delta > 0 ? `+${a.delta}` : a.delta || "0"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Nothing yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
