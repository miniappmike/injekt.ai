import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TO_AUTH } from "./stage";

/** Frosted glass over the crimson backdrop: dark enough that text on it reads anywhere on the page. */
export const GLASS =
  "rounded-3xl border border-white/12 bg-[rgb(14_3_8/0.55)] shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_24px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur-2xl";

/** The white pill that opens sign-up (same button as the form's own). */
export function JoinButton({ children = "Join Now", className, arrow = false }: { children?: React.ReactNode; className?: string; arrow?: boolean }) {
  return (
    <Link
      href="/signup"
      transitionTypes={TO_AUTH}
      className={cn(
        "inline-flex h-12 select-none items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-[#2a0512] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.7)] transition-all duration-150 hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30",
        className,
      )}
    >
      {children}
      {arrow && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
    </Link>
  );
}

/** A quieter glass pill for the second action beside Join Now. */
export function GhostLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] backdrop-blur-xl transition-colors duration-150 hover:border-white/35 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-300">{children}</p>;
}

export function SectionHeading({ eyebrow, title, body, className }: { eyebrow: string; title: React.ReactNode; body?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-[15px] leading-relaxed text-white/75 sm:text-base">{body}</p>}
    </div>
  );
}

/** The round icon badge used on every feature card. */
export function IconBadge({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-[linear-gradient(145deg,rgb(255_122_156/0.28),rgb(232_38_94/0.12))] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]", className)}>
      <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
    </span>
  );
}

export function FeatureCard({ icon, title, body, tag }: { icon: LucideIcon; title: string; body: React.ReactNode; tag?: string }) {
  return (
    <div className={cn(GLASS, "flex flex-col gap-4 p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/25 sm:p-6")}>
      <div className="flex items-center justify-between gap-3">
        <IconBadge icon={icon} />
        {tag && <span className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold text-white/80">{tag}</span>}
      </div>
      <div>
        <h3 className="text-[17px] font-semibold text-white">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/70">{body}</p>
      </div>
    </div>
  );
}

/** The closing band at the bottom of each page. */
export function ClosingCta({ title, body }: { title: string; body: string }) {
  return (
    <section className={cn(GLASS, "flex flex-col items-start gap-6 p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between")}>
      <div className="max-w-xl">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-white/75">{body}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <JoinButton arrow />
        <Link
          href="/login"
          transitionTypes={TO_AUTH}
          className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.08] px-6 text-[15px] font-semibold text-white backdrop-blur-xl transition-colors duration-150 hover:border-white/35 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15"
        >
          Log In
        </Link>
      </div>
    </section>
  );
}
