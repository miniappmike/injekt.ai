import Link from "next/link";
import { ArrowRight, Flame, Settings } from "lucide-react";
import { Studio } from "@/components/dashboard/studio";
import { GenerationSwitch, NextStep, RecentImages } from "@/components/dashboard/tiles";
import { DiscordIcon } from "@/components/social-icons";
import { TokenIcon } from "@/components/token-icon";
import { requireUser } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { entitlements } from "@/lib/entitlements";
import { DISCORD_URL } from "@/lib/links";
import { IMAGE_CREDITS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };
// Finishes any image that completed while you were away, so it shows under Recent images.
export const maxDuration = 60;

const STAT = "panel flex flex-col gap-1 p-4";
const SMALL = "text-xs text-neutral-400";

/** The signed-in home: the model you're working on, what to do next, what's about to expire, and the way to everything else. */
export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const [d, plan] = await Promise.all([loadDashboard(supabase, user), entitlements.planOf(user.id)]);
  const pro = plan !== "free";
  const total = d.market.available + d.market.sold;

  return (
    <div>
      <h1 className="page-title">Home</h1>
      <div className="mt-5 grid grid-cols-6 gap-3 max-sm:mt-2 sm:gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_auto]">
        <Studio
          characters={d.characters}
          focusId={d.focusId}
          heroClass="col-span-6 md:col-span-3 lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1"
          dropClass="col-span-6 md:col-span-3 lg:col-span-3 lg:col-start-4 lg:row-start-1 lg:min-h-[11rem]"
        />
        <NextStep steps={d.steps} focusId={d.focusId} className="col-span-6 max-md:order-first md:col-span-3 lg:col-span-3 lg:col-start-7 lg:row-start-1" />
        <RecentImages images={d.recent} className="col-span-6 lg:col-span-6 lg:col-start-4 lg:row-start-2" />

        <Link href="/tokens" className={cn(STAT, "col-span-2 transition-colors hover:border-neutral-700 lg:col-span-3 lg:col-start-1 lg:row-start-3")}>
          <span className={SMALL}>Tokens</span>
          <span className="flex items-center gap-2 font-display text-2xl font-bold tabular-nums text-neutral-50 sm:text-3xl">
            <TokenIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            {(d.tokens ?? 0).toLocaleString()}
          </span>
          <span className="mt-auto text-xs font-medium text-brand-300">
            <span className="max-sm:hidden">about {Math.floor((d.tokens ?? 0) / IMAGE_CREDITS["1k"]).toLocaleString()} images · </span>Get more
          </span>
        </Link>
        <div className={cn(STAT, "col-span-2 lg:col-span-3 lg:col-start-4 lg:row-start-3")}>
          <span className={SMALL}>Images this month</span>
          <span className="font-display text-2xl font-bold tabular-nums text-neutral-50 sm:text-3xl">{d.imagesThisMonth.toLocaleString()}</span>
          <span className="mt-auto text-xs text-neutral-400">{d.imagesThisWeek > 0 ? `${d.imagesThisWeek.toLocaleString()} in the last 7 days` : "None in the last 7 days"}</span>
        </div>
        <GenerationSwitch enabled={d.generation} className="col-span-2 lg:col-span-3 lg:col-start-7 lg:row-start-3" />

        {/* The persona with the best rank among those still for sale. It changes when the ranking does, or when she sells. */}
        <section aria-label="Marketplace" className="panel col-span-6 flex overflow-hidden md:col-span-3 lg:col-span-3 lg:col-start-10 lg:row-span-2 lg:row-start-1 lg:flex-col max-lg:h-40">
          {d.trending ? (
            <Link href={`/marketplace/${d.trending.id}`} className="group relative block w-28 shrink-0 bg-gradient-to-br from-neutral-800 to-neutral-950 sm:w-32 lg:aspect-[2/3] lg:w-full lg:flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.trending.image && <img src={d.trending.image} alt="" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" />}
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-neutral-950/95 to-transparent" />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[linear-gradient(90deg,#ff5f2e,#f92776)] px-2 py-1 text-[9px] font-extrabold whitespace-nowrap uppercase tracking-[0.06em] text-white lg:px-2.5 shadow-[0_6px_18px_rgb(249_39_118/0.6)] lg:left-3 lg:top-3 lg:text-[11px]">
                <Flame aria-hidden="true" className="h-3 w-3" />
                {d.trending.rank === 1 ? "#1 Trending" : "Trending"}
              </span>
              <span className="absolute inset-x-0 bottom-0 p-2.5 lg:p-4">
                <span className="block font-poster text-2xl leading-none tracking-wide text-white uppercase lg:text-[2.6rem]">{d.trending.name}</span>
                <span className="mt-1 hidden items-center gap-1 text-xs font-medium text-white lg:inline-flex">
                  View in Marketplace
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          ) : (
            <div className="flex w-28 shrink-0 items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 p-3 text-center text-xs text-neutral-400 sm:w-32 lg:w-full lg:flex-1">New personas soon</div>
          )}
          <Link href="/marketplace" className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-4 transition-colors hover:bg-neutral-800/40 lg:flex-none">
            {d.trending?.tagline && <span className="line-clamp-2 text-sm text-neutral-300 lg:hidden">{d.trending.tagline}</span>}
            <span className="text-xs text-neutral-300">
              <span className="font-semibold text-neutral-50">{d.market.available}</span> available · <span className="font-semibold text-neutral-50">{d.market.sold}</span> sold
            </span>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-iris-500" style={{ width: `${total ? Math.round((d.market.sold / total) * 100) : 0}%` }} />
            </span>
            <span className="text-xs font-medium text-brand-300 lg:hidden">Open the Marketplace</span>
          </Link>
        </section>

        <div className="col-span-6 grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-3 lg:col-start-10 lg:row-start-3">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="panel flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 p-3 text-center text-sm font-semibold text-neutral-100 transition-colors hover:border-iris-500/50">
            <DiscordIcon className="h-6 w-6 text-iris-400" />
            Discord
          </a>
          <Link href="/settings/api-keys" className="panel flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 p-3 text-center text-sm font-semibold text-neutral-100 transition-colors hover:border-neutral-700">
            <Settings aria-hidden="true" className="h-6 w-6 text-brand-300" strokeWidth={1.8} />
            Settings
          </Link>
        </div>
      </div>
      {!pro && (
        <p className="mt-4 text-center text-xs text-neutral-500">
          Free plan.{" "}
          <Link href="/upgrade" className="font-medium text-neutral-300 underline-offset-4 hover:text-white hover:underline">Upgrade to Pro</Link> for unlimited models and no daily limits.
        </p>
      )}
    </div>
  );
}
