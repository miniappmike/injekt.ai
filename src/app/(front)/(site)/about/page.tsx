import {
  BadgeCheck,
  Brush,
  CircleDollarSign,
  CreditCard,
  Database,
  EyeOff,
  Filter,
  Fingerprint,
  Hourglass,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  Lock,
  Rocket,
  ScanFace,
  ShieldCheck,
  Target,
  UserCheck,
  UserRoundPlus,
  WandSparkles,
  Zap,
} from "lucide-react";
import { ClosingCta, GLASS, IconBadge, SectionHeading } from "@/components/front/parts";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "About | ModelSpawn",
  description: "Why ModelSpawn exists, what else is out there, and what you get here that you don't get elsewhere.",
};

const REASONS = [
  { icon: CircleDollarSign, title: "The pricing was ridiculous", body: "AI model tools charge hundreds of dollars before you have made a single picture. That is a lot to risk on something you are only trying out." },
  { icon: Hourglass, title: "Prompting is 90% of the work", body: "The image takes seconds. Writing, rewriting and fixing the prompt takes the evening. That is the part worth automating." },
  { icon: ScanFace, title: "Faces still drift", body: "Even good generators lose the face after a few pictures. So we built likeness checks that score an image against your model before it goes anywhere." },
  { icon: Zap, title: "No fluff", body: "Practical tools, guides and harnesses that cut your creation time. If it doesn't get you to a finished picture faster, it isn't here." },
];

/** What the alternatives charge, as listed on their own sites. Check these before each launch; prices move. */
const COMPETITORS = [
  { name: "ai-people.io", price: "$249 per persona", note: "No generation tools included" },
  { name: "famebase.co", price: "$99 to $249 per model", note: "" },
  { name: "digitaldivas.ai", price: "Up to $79 per model", note: "No longer active" },
  { name: "synthlife.co", price: "", note: "No longer active" },
  { name: "Everyone else", price: "Severely overpriced", note: "Cluttered, and a higher risk to start" },
];

const ADVANTAGES = [
  { icon: ShieldCheck, title: "Low risk", body: "Start free. Nothing big to lose finding out if it suits you." },
  { icon: BadgeCheck, title: "Fairly priced", body: "A few dollars, not a few hundred." },
  { icon: EyeOff, title: "Private transactions", body: "Pay with Telegram Stars or crypto." },
  { icon: CreditCard, title: "Zero card information", body: "We never ask for a card, so there is none to leak." },
  { icon: LifeBuoy, title: "Full support", body: "A real person answers, and reads what you ask for." },
  { icon: Lock, title: "Private generation", body: "Your pictures stay in your own account." },
  { icon: KeyRound, title: "Bring your own key", body: "Run on your own model keys and pay the provider directly." },
  { icon: Database, title: "Own your data", body: "Delete your account any time and your models and pictures go with it." },
  { icon: UserCheck, title: "Own your model", body: "The persona you build here is yours to use anywhere." },
  { icon: UserRoundPlus, title: "Bring your own model", body: "Already running one? Import her photos and carry on." },
  { icon: Target, title: "Simple, focused suite", body: "A handful of tools that each do one job well." },
  { icon: Fingerprint, title: "Identity lock baked in", body: "Her sheets go into every prompt automatically." },
  { icon: WandSparkles, title: "Prompt optimization", body: "The prompt is written and tuned for you." },
  { icon: Brush, title: "Anime to real image", body: "Turn artwork into a realistic photo." },
  { icon: Filter, title: "Minimal filters", body: "We add no content rules beyond the model providers' own." },
  { icon: LayoutGrid, title: "Clean layout", body: "No clutter, on a phone or a desktop." },
  { icon: Rocket, title: "Early stage", body: "Build with us: your feedback decides what comes next." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-20 px-5 pt-12 sm:gap-28 sm:px-8 sm:pt-16">
      <section className="animate-fade-up">
        <div className="max-w-2xl">
          <h1 className="text-[2.6rem] font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">Built by People Who Got Tired of Prompting</h1>
          <p className="mt-5 text-base leading-relaxed text-white/80 sm:text-lg">ModelSpawn started as a personal tool. It turned into a full creation suite because other people kept asking to use it.</p>
        </div>

        <div className={cn(GLASS, "mt-10 p-6 sm:p-9")}>
          <h2 className="text-2xl font-bold tracking-tight text-white">Why we started</h2>
          <div className="mt-4 flex max-w-3xl flex-col gap-4 text-[15px] leading-relaxed text-white/80 sm:text-base">
            <p>We ran AI influencers ourselves, out of passion and for the fun of it. Then we took a break, and the reason was simple: prompting fatigue. Every picture meant writing a long prompt by hand, watching the face drift, and writing it again.</p>
            <p>Stepping away made the real problem obvious. It wasn&apos;t the models or the generators. It was prompting manually. So we built a suite that does it for us, the way an agency would want it: create the model once, lock her identity, and let the tools write the prompts.</p>
            <p>Friends wanted to try it. Then their friends did. That is the ModelSpawn you are looking at.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map((r) => (
            <div key={r.title} className={cn(GLASS, "flex flex-col gap-4 p-5 sm:p-6")}>
              <IconBadge icon={r.icon} />
              <div>
                <h3 className="text-[17px] font-semibold text-white">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="The alternatives" title="What else is out there" body="We looked before we built. This is what we found." />
        <div className={cn(GLASS, "mt-8 overflow-hidden")}>
          <ul className="divide-y divide-white/10">
            {COMPETITORS.map((c) => (
              <li key={c.name} className="grid gap-1 px-5 py-4 sm:grid-cols-[1.1fr_1fr_1.3fr] sm:items-center sm:gap-6 sm:px-7">
                <span className="text-[15px] font-semibold text-white">{c.name}</span>
                <span className="text-[15px] text-white/85">{c.price || "No pricing available"}</span>
                <span className="text-sm text-white/65">{c.note}</span>
              </li>
            ))}
            <li className="grid gap-1 bg-white/[0.08] px-5 py-5 sm:grid-cols-[1.1fr_1fr_1.3fr] sm:items-center sm:gap-6 sm:px-7">
              <span className="text-[15px] font-bold text-white">ModelSpawn</span>
              <span className="text-[15px] font-semibold text-white">Free to start, $9.99 for Pro</span>
              <span className="text-sm text-white/85">Generation tools, identity lock and likeness checks included</span>
            </li>
          </ul>
        </div>
        <p className="mt-3 text-xs text-white/65">Prices as listed on each site, November 2026.</p>
      </section>

      <section>
        <SectionHeading eyebrow="Our advantage" title="What you get here" />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADVANTAGES.map((a) => (
            <li key={a.title} className={cn(GLASS, "flex items-start gap-4 rounded-2xl p-4 sm:p-5")}>
              <IconBadge icon={a.icon} className="h-10 w-10 rounded-xl" />
              <div>
                <h3 className="text-[15px] font-semibold text-white">{a.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-white/70">{a.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ClosingCta title="Build with us" body="ModelSpawn is early. Join now, tell us what's missing, and watch it show up." />
    </div>
  );
}
