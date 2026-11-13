"use client";

import { useRouter } from "next/navigation";
import { BackIcon } from "@/components/icons";

/**
 * Goes back to the page the visitor came from (e.g. the login form) when that page is part of this site; otherwise,
 * such as a fresh tab opened from the sign-up form, it opens `fallback` instead so no one is left stuck.
 */
export function BackButton({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  const goBack = () => {
    let sameSite = false;
    try {
      sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin;
    } catch {}
    if (sameSite && history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className="-ml-1 inline-flex h-10 items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/70 pl-3 pr-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
    >
      <BackIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
