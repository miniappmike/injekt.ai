"use client";

import { useState } from "react";
import { deleteMyAccount } from "@/app/(app)/settings/account-actions";
import { DELETE_CONFIRM_WORD } from "@/lib/account";
import { CONTACT_EMAIL } from "@/lib/links";
import { Input } from "@/components/ui/input";

/**
 * Settings' danger zone: permanently delete the account. A button opens the confirmation, which needs the word typed;
 * after it's done the browser goes to the sign-in page.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setBusy(true);
    setError(undefined);
    const r = await deleteMyAccount(word.trim());
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    // A full page load, so nothing from the signed-in session stays on screen.
    window.location.assign("/login?deleted=1");
  }

  return (
    <section id="delete-account" className="panel flex scroll-mt-28 flex-col gap-3 border-red-500/30 p-5" aria-labelledby="delete-title">
      <div>
        <h2 id="delete-title" className="font-display text-lg font-bold text-neutral-50">Delete account</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Permanently deletes your account, characters, uploads, generated images, prompt history, saved keys, settings and tokens. This can&apos;t be undone, and
          tokens and Pro time aren&apos;t refunded. Download anything you want to keep first.
        </p>
      </div>
      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-red-500/50 px-3.5 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            Delete my account
          </button>
        </div>
      ) : (
        <div role="dialog" aria-labelledby="delete-confirm" className="animate-pop-in rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
          <p id="delete-confirm" className="font-semibold text-red-200">Are you sure? This deletes everything, for good.</p>
          <label className="mt-3 flex flex-col gap-1.5 text-neutral-300">
            <span>
              Type <b className="font-mono text-neutral-100">{DELETE_CONFIRM_WORD}</b> to confirm
            </span>
            <Input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="max-w-xs" aria-label={`Type ${DELETE_CONFIRM_WORD} to confirm`} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || word.trim() !== DELETE_CONFIRM_WORD}
              onClick={run}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Deleting..." : "Delete my account forever"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setOpen(false); setWord(""); setError(undefined); }} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800">
              Cancel
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
          <p className="mt-3 text-xs text-neutral-500">
            Payment and order records are kept without your name for accounting. Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
          </p>
        </div>
      )}
    </section>
  );
}
