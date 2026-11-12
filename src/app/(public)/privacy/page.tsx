import type { Metadata } from "next";
import Link from "next/link";
import { GENERATION_RETENTION_HOURS } from "@/lib/retention";
import { CONTACT_EMAIL } from "@/lib/links";
import { PRIVACY_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

/** Last changed: update PRIVACY_UPDATED (src/lib/legal.ts) whenever the text below changes. */
const UPDATED = PRIVACY_UPDATED;

const h2 = "mt-8 font-display text-lg font-bold text-neutral-50";
const h3 = "mt-4 text-sm font-semibold text-neutral-100";
const p = "mt-2 text-sm leading-relaxed text-neutral-300";
const ul = "mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-neutral-300";
const b = "text-neutral-100";

const Email = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">
    {CONTACT_EMAIL}
  </a>
);

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl pb-10">
      {/* Its own heading (not .page-title, which phones hide in favour of the app's top bar): signed-out visitors read this too. */}
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-neutral-50 sm:text-[2.05rem]">Privacy Policy</h1>
      <span aria-hidden="true" className="mt-2 block h-[3px] w-12 rounded-full bg-gradient-to-r from-brand-500 to-iris-500 shadow-[0_0_14px_rgb(232_38_94/0.6)]" />
      <p className="mt-3 text-xs text-neutral-500">Last updated {UPDATED}</p>
      <p className={p}>
        This policy explains what Model Spawn (&quot;we&quot;, &quot;the service&quot;) collects, why, who it&apos;s shared with, how long it&apos;s kept, and the choices you
        have. It goes with our{" "}
        <Link href="/terms" className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">Terms of Service</Link>.
      </p>

      <h2 className={h2}>1. What we collect</h2>
      <h3 className={h3}>Your account</h3>
      <ul className={ul}>
        <li>Your email address and password. Passwords are handled by our sign-in provider and stored only in hashed form; we never see them.</li>
        <li>Whether your email is confirmed, your plan (Free or Pro) and when Pro ends, and your settings (such as whether image generation is on).</li>
      </ul>
      <h3 className={h3}>What you create and upload</h3>
      <ul className={ul}>
        <li>Characters: their names, profile text, reference photos, reference sheets, saved outfits and related images.</li>
        <li>Target photos you add, and the prompts written for them (your prompt history).</li>
        <li>Images generated for you.</li>
        <li>Photos you upload have their hidden metadata (such as camera details and location) removed when they&apos;re saved.</li>
      </ul>
      <h3 className={h3}>Your own API keys (Pro)</h3>
      <ul className={ul}>
        <li>Keys you add are stored encrypted. Only their last 4 characters are ever shown, and they&apos;re used only to run your own jobs.</li>
      </ul>
      <h3 className={h3}>Usage, tokens and payments</h3>
      <ul className={ul}>
        <li>Your token balance and every token added or spent (for example: image, prompt, profile build, refund).</li>
        <li>A ledger of AI calls: which feature and model was used, how much text was processed, what it cost and when.</li>
        <li>Daily usage counts, used for the free plan&apos;s daily limits.</li>
        <li>Orders: what you bought, the amount, its status and when it was paid. Card and payment details are handled by the payment provider; we don&apos;t receive or store them.</li>
        <li>
          To give the Pro first-month bonus only once per person, we keep a normalised form of your email, plus one-way scrambled codes (hashes) made from a random
          ID stored in your browser and from your network (IP) address. The hashes can&apos;t be turned back into the original ID or address.
        </li>
      </ul>
      <h3 className={h3}>Marketplace</h3>
      <ul className={ul}>
        <li>Hearts you give and views of persona pages, recorded against your account or, if you&apos;re signed out, a random visitor ID.</li>
        <li>Personas you buy.</li>
      </ul>
      <h3 className={h3}>Technical information</h3>
      <ul className={ul}>
        <li>Your IP address is used briefly to limit abuse (for example, how many requests can be made per minute) and appears in our hosting provider&apos;s standard request logs.</li>
        <li>Emails you send us, if you contact support.</li>
      </ul>

      <h2 className={h2}>2. Cookies and browser storage</h2>
      <ul className={ul}>
        <li><b className={b}>Sign-in cookies</b> keep you logged in. The service doesn&apos;t work without them.</li>
        <li><b className={b}>A visitor cookie</b> (a random ID, kept for up to a year) lets signed-out visitors heart marketplace personas once.</li>
        <li>
          <b className={b}>Browser storage</b> on your device remembers your preferences and work in progress: options you chose, images still being generated, a random
          device ID (for the first-month bonus check) and when you last refreshed the Ledger. You can clear it in your browser settings.
        </li>
        <li>We don&apos;t use advertising cookies, and we don&apos;t use third-party analytics or tracking tools.</li>
      </ul>

      <h2 className={h2}>3. How we use it</h2>
      <ul className={ul}>
        <li>To run the service: write prompts, generate and store images, and show your history, ledger and balance.</li>
        <li>To charge tokens, apply plan limits and deliver what you buy.</li>
        <li>To prevent abuse and fraud, such as repeated free bonuses or excessive requests.</li>
        <li>To enforce our Terms of Service, respond to takedown requests and meet legal obligations.</li>
        <li>To answer you when you contact us.</li>
      </ul>
      <p className={p}>We don&apos;t sell your personal information, we don&apos;t show ads, and we don&apos;t use your content to train AI models.</p>

      <h2 className={h2}>4. Who we share it with</h2>
      <p className={p}>Only with the services that run Model Spawn, and only what each one needs:</p>
      <ul className={ul}>
        <li><b className={b}>Supabase</b>: our database, file storage, sign-in and account emails.</li>
        <li><b className={b}>Vercel</b>: hosts the website, so your requests pass through it.</li>
        <li>
          <b className={b}>SpicyAPI and the AI model providers it uses</b>: your prompts and the images needed for a job are sent to them to write prompts and make images.
          They handle that data under their own policies. If you use your own API key, the job goes to your chosen provider on your account.
        </li>
        <li><b className={b}>Payment providers</b>: process your payments under their own policies.</li>
        <li><b className={b}>Rate-limiting service</b>: may receive your account ID or IP address to count requests.</li>
        <li>
          <b className={b}>Authorities</b>: when the law requires it, or to report illegal content such as child sexual abuse material or non-consensual intimate imagery.
        </li>
      </ul>

      <h2 className={h2}>5. How long we keep it</h2>
      <ul className={ul}>
        <li>Generated images: deleted automatically {GENERATION_RETENTION_HOURS} hours after they&apos;re made.</li>
        <li>Characters, uploads, saved outfits and prompt history: until you delete them, or your account is deleted.</li>
        <li>Token balances, token history, the AI-call ledger and daily usage: deleted with your account.</li>
        <li>
          Order and marketplace sale records, and first-month bonus records (the normalised email and hashes): kept after an account is deleted, without the link to
          your account, for accounting and to stop the bonus being claimed twice.
        </li>
        <li>Backups and logs held by our providers may keep copies for a short time after deletion.</li>
      </ul>

      <h2 className={h2}>6. Your choices and rights</h2>
      <ul className={ul}>
        <li>You can view, edit and delete your characters, and delete your prompt history (one entry or all of it), at any time in the app.</li>
        <li>Download any generated images you want to keep before they expire.</li>
        <li>
          Delete your account at any time in <b className={b}>Settings → Delete account</b>. It permanently removes your account, characters, uploads, generated
          images, prompt history, saved keys, settings and tokens.
        </li>
        <li>To get a copy of your data or correct it, email <Email />.</li>
        <li>
          Depending on where you live, you may have more rights over your data, such as objecting to how it&apos;s used or complaining to a data protection authority.
          Email us and we&apos;ll help.
        </li>
      </ul>

      <h2 className={h2}>7. Security</h2>
      <ul className={ul}>
        <li>Data is encrypted in transit. Files are kept in private storage that only your account can reach, and your own API keys are encrypted.</li>
        <li>No system is perfectly secure, so please use a strong, unique password.</li>
      </ul>

      <h2 className={h2}>8. Age</h2>
      <p className={p}>Model Spawn is for adults 18 and over. We don&apos;t knowingly collect data from anyone under 18, and we delete accounts we learn belong to a minor.</p>

      <h2 className={h2}>9. Where data is stored</h2>
      <p className={p}>Our providers may store and process data in countries other than yours, including the United States.</p>

      <h2 className={h2}>10. Changes</h2>
      <p className={p}>We may update this policy. The date at the top shows the latest version. If a change is significant, we&apos;ll let you know in the app.</p>

      <h2 className={h2}>11. Contact</h2>
      <p className={p}>
        Privacy questions and data requests go to <Email />.
      </p>
    </article>
  );
}
