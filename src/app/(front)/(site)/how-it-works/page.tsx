import {
  Brush,
  Camera,
  Check,
  Clapperboard,
  Copy,
  History,
  KeyRound,
  Layers,
  Pin,
  ScanFace,
  Store,
  Syringe,
  UserRoundPlus,
  Users,
  WandSparkles,
} from "lucide-react";
import { ClosingCta, FeatureCard, GLASS, IconBadge, JoinButton, SectionHeading } from "@/components/front/parts";
import { dollars, FREE_CREDITS, IMAGE_CREDITS, PRO, PROMPT_CREDITS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "How It Works",
  description: "Create a model, put her in any photo, check the likeness. Every ModelSpawn tool, explained simply.",
};

const STEPS = [
  {
    icon: UserRoundPlus,
    title: "Create your model",
    body: "Create Model walks you through her face, then her body, then builds the reference sheets that pin both down. Already have a model? Bring her photos instead.",
    points: ["Face sheet and body sheet", "Blend up to three body photos into one", "A written profile that goes into every prompt"],
  },
  {
    icon: Syringe,
    title: "Put her in any photo",
    body: "Open Inject and add a photo with the pose, outfit and scene you want. ModelSpawn reads it and writes the prompt that recreates it with your model in it.",
    points: ["Keep the outfit, recolour it, or choose your own", "Up to four versions at a time", "Or skip the photo: describe it in Director"],
  },
  {
    icon: ScanFace,
    title: "Check it, then post",
    body: "Run the result through Likeness. You get a score for each trait and, when something drifted, a fixed prompt that repairs her face, hair, skin tone and proportions without touching the outfit.",
    points: ["Trait-by-trait scores", "One-press fix prompt", "Pin the best ones as new reference photos"],
  },
];

const TOOLS = [
  { icon: UserRoundPlus, title: "Create Model", body: "A step-by-step builder for a new persona: her face, her body, and the reference sheets that keep both the same from one picture to the next." },
  { icon: Syringe, title: "Inject", body: "Put your model into any photo. Add a picture you like and get a prompt that swaps her in, or edit the photo itself." },
  { icon: Clapperboard, title: "Director", body: "Say what you want to see in your own words. The prompt is written behind the scenes with her sheets locked in." },
  { icon: Layers, title: "Variants", body: "Got an image you love? Photoshoot makes new takes of the same scene, and Moments plans shots from throughout her day." },
  { icon: ScanFace, title: "Likeness", body: "Score any image against your model, trait by trait, and get a fixed prompt to try again." },
  { icon: Brush, title: "Art to Real", body: "Turn anime, a drawing or a render into a realistic photo, or put one of your own models into it." },
  { icon: Users, title: "Group photo", body: "Put several of your models in one picture. Each keeps her own face and body." },
  { icon: Pin, title: "Pin It", body: "Pin your best generated images to a model as reference photos, up to five each, so she keeps getting more consistent." },
  { icon: History, title: "History", body: "Every prompt and image you have made, ready to copy, rerun or check again." },
  { icon: Store, title: "Marketplace", body: "Browse ready-made personas with their own looks and backstories." },
];

const WAYS = [
  { icon: Copy, title: "Copy the prompt", body: "Take the finished prompt anywhere. Paste it into the image generator you already use, with the images in the order shown." },
  { icon: Camera, title: "Generate right here", body: `Make the image inside ModelSpawn with tokens: ${IMAGE_CREDITS["1k"]} to ${IMAGE_CREDITS["2k"]} an image depending on size, ${PROMPT_CREDITS} for a prompt.` },
  { icon: KeyRound, title: "Bring your own key", body: "On Pro, plug in your own model keys. Images on your own image key cost no tokens, and your keys are stored encrypted." },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-20 px-5 pt-12 sm:gap-28 sm:px-8 sm:pt-16">
      <section className="animate-fade-up">
        <div className="max-w-2xl">
          <h1 className="text-[2.6rem] font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">How ModelSpawn Works</h1>
          <p className="mt-5 text-base leading-relaxed text-white/80 sm:text-lg">
            You create a model once. After that, every tool here does the same job from a different angle: put her in a new picture and keep her looking like herself.
          </p>
        </div>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className={cn(GLASS, "flex flex-col gap-4 p-6 sm:p-7")}>
              <div className="flex items-center gap-3">
                <IconBadge icon={s.icon} />
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Step {i + 1}</p>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{s.body}</p>
              </div>
              <ul className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-4">
                {s.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-white/85">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionHeading eyebrow="The tools" title="One focused suite, nothing you won't use" body="Each tool does one thing. All of them start from the same model, so her identity carries through." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <FeatureCard key={t.title} {...t} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="Your way" title="Use our generator, yours, or both" body="ModelSpawn is a prompt workflow first. Where the image gets made is up to you." />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {WAYS.map((w) => (
            <FeatureCard key={w.title} {...w} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="What it costs" title="Start free. Stay for the price of a lunch." body="Pay with Telegram Stars or crypto. We never ask for card details." />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className={cn(GLASS, "flex flex-col gap-5 p-6 sm:p-8")}>
            <div>
              <h3 className="text-xl font-semibold text-white">Free</h3>
              <p className="mt-1 text-4xl font-bold tracking-tight text-white">$0</p>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm text-white/85">
              {[`${FREE_CREDITS} tokens when you join`, "One model", "Every tool, with daily limits", "Copying prompts is always free"].map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                  {p}
                </li>
              ))}
            </ul>
            <JoinButton className="mt-auto self-start" />
          </div>
          <div className={cn(GLASS, "flex flex-col gap-5 border-white/25 p-6 sm:p-8")}>
            <div>
              <h3 className="flex items-center gap-2 text-xl font-semibold text-white">
                Pro
                <WandSparkles aria-hidden="true" className="h-5 w-5 text-brand-300" />
              </h3>
              <p className="mt-1 text-4xl font-bold tracking-tight text-white">
                {dollars(PRO.priceCents)}
                <span className="ml-2 text-base font-medium text-white/65">for {PRO.days} days</span>
              </p>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm text-white/85">
              {[
                `${PRO.monthlyCredits} tokens a month (${PRO.firstMonthCredits} your first)`,
                "Unlimited models",
                "No daily limits",
                "Bring your own keys: images on your key cost no tokens",
                "Top up any time with token packs that never expire",
              ].map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                  {p}
                </li>
              ))}
            </ul>
            <JoinButton className="mt-auto self-start">Join, Then Upgrade</JoinButton>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/65">{`${dollars(PRO.priceCents)} is the price in crypto. In Telegram, Pro is ${PRO.stars} Stars, and what Telegram charges for Stars varies by device and region.`}</p>
      </section>

      <ClosingCta title="See it with your own model" body={`Join with ${FREE_CREDITS} free tokens, create her, and run your first photo in a few minutes.`} />
    </div>
  );
}
