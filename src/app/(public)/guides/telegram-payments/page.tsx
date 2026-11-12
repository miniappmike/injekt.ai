import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/links";

export const metadata: Metadata = { title: "How to pay with Telegram" };

// A placeholder until the full guide (with screenshots) is ready.
export default function TelegramPaymentsGuide() {
  return (
    <article className="mx-auto max-w-2xl pb-10">
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-neutral-50 sm:text-[2.05rem]">How to pay with Telegram</h1>
      <span aria-hidden="true" className="mt-2 block h-[3px] w-12 rounded-full bg-gradient-to-r from-brand-500 to-iris-500 shadow-[0_0_14px_rgb(232_38_94/0.6)]" />
      <div className="mt-6 rounded-2xl border border-[#2aabee]/30 bg-[#2aabee]/5 p-5">
        <p className="font-semibold text-neutral-100">A step-by-step guide with screenshots is coming soon.</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          The quick version: on the Pro or Tokens page, choose <b className="text-neutral-100">Pay with Telegram</b>, then <b className="text-neutral-100">Continue to payment</b>.
          Telegram opens with the payment, and if you don&apos;t have enough Stars it sells them right there with a card, Apple Pay or Google Pay. It works best in the
          Telegram app on your phone.
        </p>
      </div>
      <p className="mt-6 text-sm text-neutral-400">
        Stuck? Email <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-400 hover:underline">{CONTACT_EMAIL}</a>.{" "}
        <Link href="/tokens" className="font-semibold text-neutral-200 hover:underline">Back to Tokens</Link>
      </p>
    </article>
  );
}
