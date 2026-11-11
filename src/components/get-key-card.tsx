import Link from "next/link";
import { GET_KEY_PATH, REFERRAL_DISCLOSURE, SPICYAPI_REFERRAL_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

/** "Don't have a key?": the referral link to SpicyAPI and the guide, with the referral disclosure. */
export function GetKeyCard({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="get-key-title"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-iris-500/30 bg-[radial-gradient(120%_140%_at_100%_0%,rgb(91_91_246/0.18),transparent_60%),var(--color-neutral-900)] p-5",
        className,
      )}
    >
      <h2 id="get-key-title" className="font-display text-lg font-bold text-neutral-50">Don&apos;t have a key yet?</h2>
      <p className="mt-1 text-sm leading-relaxed text-neutral-300">
        One SpicyAPI key does everything here: it generates images and writes prompts with no daily limit. You pay SpicyAPI directly for what you use.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={SPICYAPI_REFERRAL_URL}
          target="_blank"
          rel="noopener sponsored"
          className="glow-brand inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-95"
        >
          Get a SpicyAPI key
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3h6v6M17 3l-8 8M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
          </svg>
        </a>
        <Link href={GET_KEY_PATH} className="inline-flex h-10 items-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-100 transition-colors hover:border-neutral-500">
          How to set it up
        </Link>
      </div>
      <p className="mt-3 text-xs text-neutral-500">{REFERRAL_DISCLOSURE}</p>
    </section>
  );
}
