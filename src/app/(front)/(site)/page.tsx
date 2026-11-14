import Link from "next/link";
import { ArrowRight, Fingerprint, KeyRound, ScanFace, UserRoundPlus, WandSparkles, Syringe } from "lucide-react";
import { FaqSection } from "@/components/front/faq";
import { HeroCollage } from "@/components/front/hero-collage";
import { ClosingCta, FeatureCard, GhostLink, GLASS, IconBadge, JoinButton, SectionHeading } from "@/components/front/parts";
import { FREE_CREDITS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata = {
  title: { absolute: "ModelSpawn: create your AI model once, put her in any photo" },
  description: "A creation suite for AI models. ModelSpawn writes the prompts, locks her identity into every picture and scores the results for likeness.",
};

const FEATURES = [
  { icon: Fingerprint, title: "Identity lock, built in", body: "Her face and body sheets go into every prompt, so she is the same woman in picture one and picture one hundred." },
  { icon: WandSparkles, title: "Prompts written for you", body: "Add a photo you like, or say what you want in your own words. The optimized prompt is written behind the scenes." },
  { icon: ScanFace, title: "Likeness scores", body: "Check any image against your model, trait by trait, and get a fixed prompt when the face has drifted." },
  { icon: KeyRound, title: "Private, on your terms", body: "Bring your own keys and your own model. No card details, ever. Your model and your data stay yours." },
];

const STEPS = [
  { icon: UserRoundPlus, title: "Create your model", body: "Build her face, then her body, then the reference sheet that keeps both the same." },
  { icon: Syringe, title: "Put her in any photo", body: "Pick a photo with the pose, outfit and scene you want. ModelSpawn writes the prompt that puts her in it." },
  { icon: ScanFace, title: "Check it, then post", body: "Score the result for likeness, fix what drifted, and keep the ones that are really her." },
];

export default function LandingPage() {
  return (
    <>
      {/* Headline on the left, the wall of pictures climbing up beside it. */}
      <section className="relative mx-auto max-w-[88rem] overflow-hidden px-5 pt-10 sm:px-8 sm:pt-14 lg:pt-16 xl:h-[56rem]">
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="max-w-[34rem] animate-fade-up">
            <h1 className="text-[2.75rem] font-bold leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-[4.25rem]">
              Stop Prompting.
              <br />
              Start Posting.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
              Create your AI model once. ModelSpawn writes the prompts, locks her identity into every picture, and scores any picture for likeness before you post.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <JoinButton arrow />
              <GhostLink href="/how-it-works">See How It Works</GhostLink>
            </div>
            <p className="mt-4 text-sm text-white/70">{FREE_CREDITS} free tokens when you join. No card needed.</p>
          </div>
        </div>
        <HeroCollage className="mt-12 max-h-[26rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)] xl:absolute xl:inset-x-8 xl:top-0 xl:mt-0 xl:h-full xl:max-h-none" />
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-20 px-5 pt-16 sm:gap-28 sm:px-8 sm:pt-24">
        <section>
          <SectionHeading
            eyebrow="Why ModelSpawn"
            title="Prompting is 90% of the work. We took it off your plate."
            body="Practical tools for people who run AI models: no fluff, nothing to learn first, and nothing between you and a finished picture."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="How it works" title="Three steps, start to finished picture" />
          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className={cn(GLASS, "flex gap-4 p-5 sm:p-6")}>
                <IconBadge icon={s.icon} />
                <div>
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Step {i + 1}</p>
                  <h3 className="mt-1 text-[17px] font-semibold text-white">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="mt-6 inline-flex items-center gap-2 rounded-full text-[15px] font-semibold text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
            See every tool
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>

        <FaqSection />

        <ClosingCta title="Your model is one sign-up away" body={`Start with ${FREE_CREDITS} free tokens and one model. It is early days here, so what you ask for shapes what we build next.`} />
      </div>
    </>
  );
}
