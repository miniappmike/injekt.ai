import type { Metadata } from "next";
import { CREDIT_PACKS, FREE_CREDITS, IMAGE_CREDITS, PRO, PROFILE_BUILD_CREDITS, PROMPT_CREDITS, dollars } from "@/lib/plans";
import { GENERATION_RETENTION_HOURS } from "@/lib/retention";

export const metadata: Metadata = { title: "Terms of Service" };

/** Support, takedowns and compliance. */
const CONTACT_EMAIL = "modelspawn@gmail.com";

/** Last changed. Update this whenever the text below changes. */
const UPDATED = "November 12, 2026";

const h2 = "mt-8 font-display text-lg font-bold text-neutral-50";
const p = "mt-2 text-sm leading-relaxed text-neutral-300";
const ul = "mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-neutral-300";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl pb-10">
      {/* Its own heading (not .page-title, which phones hide in favour of the app's top bar): signed-out visitors read this too. */}
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-neutral-50 sm:text-[2.05rem]">Terms of Service</h1>
      <span aria-hidden="true" className="mt-2 block h-[3px] w-12 rounded-full bg-gradient-to-r from-brand-500 to-iris-500 shadow-[0_0_14px_rgb(232_38_94/0.6)]" />
      <p className="mt-3 text-xs text-neutral-500">Last updated {UPDATED}</p>
      <p className={p}>
        These terms cover your use of Model Spawn (&quot;the service&quot;). By creating an account or using the service you agree to them. If you don&apos;t agree,
        don&apos;t use the service.
      </p>

      <h2 className={h2}>1. Who can use Model Spawn</h2>
      <ul className={ul}>
        <li>You must be at least 18 years old.</li>
        <li>You&apos;re responsible for your account and everything done with it. Keep your login details private.</li>
      </ul>

      <h2 className={h2}>2. Fictional personas only</h2>
      <p className={p}>Model Spawn is for creating and photographing fictional personas. You agree that:</p>
      <ul className={ul}>
        <li>Every character you create is fictional, or is you, or is a person who has given you their explicit consent.</li>
        <li>You won&apos;t create, upload or generate images of real people without their consent, including public figures, celebrities and influencers.</li>
        <li>You won&apos;t create deepfakes or any non-consensual intimate imagery, and won&apos;t use the service to deceive, harass, impersonate or target anyone.</li>
        <li>No character, image or prompt may depict or suggest anyone under 18.</li>
        <li>You only upload photos you took yourself or have the rights to use.</li>
        <li>You won&apos;t try to get around the safety filters of the AI models the service uses, or use the service for anything illegal.</li>
      </ul>
      <p className={p}>We may remove content, suspend or close accounts that break these rules, and report illegal content to the authorities.</p>

      <h2 className={h2}>3. Target photos: Recreate and Edit</h2>
      <p className={p}>
        By default (<b className="text-neutral-100">Recreate</b>), a target photo you add is only read to write a prompt describing its scene, pose, outfit, light and style. The
        image is then made new from your persona&apos;s references; the photo itself is not sent to the image model. <b className="text-neutral-100">Edit this photo</b> is
        optional: it sends the photo itself to be edited, and you may only use it with photos you have the rights to.
      </p>

      <h2 className={h2}>4. Tokens and Pro</h2>
      <ul className={ul}>
        <li>
          <b className="text-neutral-100">Tokens</b> pay for work done on our AI. An image costs {IMAGE_CREDITS["1k"]}, {IMAGE_CREDITS["1.5k"]} or {IMAGE_CREDITS["2k"]} tokens
          (1k, 1.5k or 2k), a prompt {PROMPT_CREDITS} and a profile build {PROFILE_BUILD_CREDITS}. If an image fails, its tokens are given back.
        </li>
        <li>New accounts get {FREE_CREDITS} free tokens once, after confirming their email. Free accounts have daily limits.</li>
        <li>
          Token packs ({CREDIT_PACKS.map((x) => `${dollars(x.priceCents)} for ${x.credits.toLocaleString()}`).join(", ")}) never expire. Tokens have no cash value and
          can&apos;t be transferred or exchanged for money.
        </li>
        <li>
          <b className="text-neutral-100">Pro</b> costs {dollars(PRO.priceCents)} for {PRO.days} days. It does not renew by itself: we remind you before it ends, and you renew
          only if you choose to. Each Pro month includes {PRO.monthlyCredits} tokens ({PRO.firstMonthCredits} in your first month, once per person). Those monthly tokens
          expire at the end of that {PRO.days}-day period.
        </li>
        <li>Pro lets you use your own AI provider keys. Anything that runs on your own key is charged to you by that provider, not in tokens.</li>
        <li>Payments are handled by third-party payment providers, and their terms also apply.</li>
      </ul>

      <h2 className={h2}>5. No refunds</h2>
      <p className={p}>
        All sales are final. There are no returns and no refunds. Pro buys {PRO.days} days of access, and payment for tokens goes to the AI and image model
        providers that do the work, who don&apos;t offer refunds or returns. (A failed image gives its tokens back to your balance; that is not a money refund.)
      </p>

      <h2 className={h2}>6. Your images and data</h2>
      <ul className={ul}>
        <li>Images and prompts are sent to third-party AI providers (such as SpicyAPI) to be processed.</li>
        <li>Generated images are deleted {GENERATION_RETENTION_HOURS} hours after they&apos;re made. Download any you want to keep.</li>
        <li>Own API keys are stored encrypted, and only their last 4 characters are ever shown.</li>
      </ul>

      <h2 className={h2}>7. How information updates</h2>
      <ul className={ul}>
        <li>
          The <b className="text-neutral-100">Ledger</b> doesn&apos;t update by itself. It loads when you open it, and its Refresh button loads your newest calls and the
          providers&apos; final charges. Refresh can be used once every 15 minutes. Costs shown first may be estimates until a final charge is looked up (on
          Refresh, and automatically once a day).
        </li>
        <li>An image being generated is checked every few seconds, so it can appear a few seconds after it&apos;s ready.</li>
        <li>Your token balance updates when an image starts or finishes, and after prompts are written.</li>
      </ul>

      <h2 className={h2}>8. The service</h2>
      <ul className={ul}>
        <li>AI output can be wrong, inconsistent or unexpected. The service is provided &quot;as is&quot;, without guarantees that it will always be available or error-free.</li>
        <li>We may change, add or remove features and prices. Changes to prices don&apos;t affect tokens or Pro time you&apos;ve already bought.</li>
        <li>We may update these terms. The date at the top shows the latest version, and continuing to use the service means you accept it.</li>
      </ul>

      <h2 className={h2}>9. Termination</h2>
      <p className={p}>
        Model Spawn reserves the right, at any time and with or without notice, to suspend or disable any account, restrict or remove tokens, restrict or end
        access to the service or any part of it, and remove any content, including for breaking these terms. Tokens and Pro time on an account suspended or
        closed for breaking these terms are not refunded. You can stop using the service at any time.
      </p>

      <h2 className={h2}>10. Your local laws</h2>
      <p className={p}>
        You are responsible for following the laws of the place where you live, and of anywhere you use the service from. Don&apos;t use Model Spawn where it,
        or anything you make with it, is against the law.
      </p>

      <h2 className={h2}>11. Contact</h2>
      <p className={p}>
        Support, takedown requests and compliance questions go to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}
