import Link from "next/link";
import { GENERATION_SETTINGS_PATH, REFERRAL_DISCLOSURE, SPICYAPI_REFERRAL_URL } from "@/lib/links";

export const metadata = { title: "Get an API key" };

/**
 * The guide to getting your own SpicyAPI key. Every "Get an API key" link on the site opens it. The step-by-step guide
 * with screenshots goes here; until then it offers the referral link and the way back to Settings.
 */
export default function GetAKeyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">Get your own API key</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-300">
        With your own SpicyAPI key you can generate images right here and write prompts with no daily limit. You pay SpicyAPI directly, only for what you use.
      </p>

      <div className="panel mt-6 flex flex-col items-start gap-3 p-5">
        <a
          href={SPICYAPI_REFERRAL_URL}
          target="_blank"
          rel="noopener sponsored"
          className="glow-brand inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-5 text-[15px] font-semibold text-white transition-all hover:bg-brand-400 active:scale-95"
        >
          Get a SpicyAPI key
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3h6v6M17 3l-8 8M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
          </svg>
        </a>
        <p className="text-sm text-neutral-400">A step-by-step guide with screenshots is coming to this page soon.</p>
        <p className="text-sm text-neutral-400">
          Already have a key?{" "}
          <Link href={GENERATION_SETTINGS_PATH.split("#")[0]} className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">Add it in Settings</Link>, then turn on{" "}
          <Link href={GENERATION_SETTINGS_PATH} className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">image generation</Link>.
        </p>
      </div>

      <p className="mt-6 text-xs text-neutral-500">{REFERRAL_DISCLOSURE}</p>
    </div>
  );
}
