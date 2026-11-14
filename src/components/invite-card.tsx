"use client";

import { useState, useSyncExternalStore } from "react";
import { Gift } from "lucide-react";
import { inviteBlurb } from "@/lib/invites";

const noop = () => () => {};

/** "Earn free tokens" on the Tokens page: the person's invite link with Copy and Share. */
export function InviteCard({ link, joined }: { link: string; joined: number }) {
  const [copied, setCopied] = useState(false);
  // Share opens the phone's or Chrome's own share sheet; where there isn't one, Copy is the way.
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The browser refused: select the link so Ctrl+C still works.
      (document.getElementById("invite-link") as HTMLInputElement | null)?.select();
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "ModelSpawn", text: "Try ModelSpawn:", url: link });
    } catch {
      // They closed the share sheet: nothing to do.
    }
  }

  return (
    <section id="invite" aria-labelledby="invite-title" className="panel scroll-mt-24 flex flex-wrap items-center gap-5 border-iris-400/40 p-5">
      <span aria-hidden="true" className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-iris-400/45 bg-iris-500/15 text-iris-400">
        <Gift className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1 basis-72">
        <h2 id="invite-title" className="font-display text-lg font-bold text-neutral-50">Earn free tokens</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-300">{inviteBlurb()}</p>
        {joined > 0 && <p className="mt-2 text-xs text-neutral-400">{joined} {joined === 1 ? "friend has" : "friends have"} signed up with your link</p>}
      </div>
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
        <label htmlFor="invite-link" className="sr-only">Your invite link</label>
        <input
          id="invite-link"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full min-w-0 truncate rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 text-sm text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400/60"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="h-11 flex-1 rounded-xl border border-iris-400/50 bg-iris-500/20 text-sm font-semibold text-indigo-100 transition-colors hover:bg-iris-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400/60"
          >
            {copied ? "Copied" : "Copy invite link"}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={share}
              className="h-11 rounded-xl border border-neutral-700 bg-neutral-800 px-5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-400/60"
            >
              Share
            </button>
          )}
        </div>
        <p role="status" className="sr-only">{copied ? "Invite link copied" : ""}</p>
      </div>
    </section>
  );
}
