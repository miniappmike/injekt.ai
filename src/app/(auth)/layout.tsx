import Link from "next/link";
import { Logo, MARK } from "@/components/logo";

/** Film grain, as on the app icon: a small noise tile laid over the whole backdrop. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#12030a]">
      {/* The app icon's backdrop, full screen: near-black plum at the top falling into crimson. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#12030a_0%,#2a0512_38%,#6d0a24_72%,#b80f3a_100%)]" />
      {/* The mark itself, huge and out of focus, shaded like the icon's "m": white-hot in the middle, pink at the edges. */}
      <svg
        aria-hidden="true"
        viewBox="255 655 1540 760"
        className="auth-mark pointer-events-none absolute -z-10 bottom-[4%] left-1/2 w-[165vw] max-w-none -translate-x-1/2 opacity-80 blur-[42px] sm:w-[120vw] sm:blur-[56px] lg:bottom-auto lg:left-auto lg:right-[-8%] lg:top-1/2 lg:w-[68vw] lg:-translate-y-1/2 lg:translate-x-0 lg:blur-[40px]"
      >
        <defs>
          <radialGradient id="ms-backdrop" gradientUnits="userSpaceOnUse" cx="1000" cy="965" r="1" gradientTransform="translate(1000 965) rotate(-12) scale(820 400) translate(-1000 -965)">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.3" stopColor="#ffc4dc" />
            <stop offset="0.6" stopColor="#ff5fa2" />
            <stop offset="1" stopColor="#f92776" />
          </radialGradient>
        </defs>
        <path d={MARK} fill="url(#ms-backdrop)" />
      </svg>
      {/* Keeps the top (logo, heading, fields) dark enough to read over the glow. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(10_2_6/0.75)_0%,rgb(10_2_6/0.35)_45%,transparent_75%)] lg:bg-[linear-gradient(90deg,rgb(10_2_6/0.8)_0%,rgb(10_2_6/0.45)_40%,transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-30 mix-blend-overlay" style={{ backgroundImage: GRAIN }} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-8 sm:px-8 lg:max-w-6xl lg:px-12 lg:pb-8 lg:pt-10">
        <div className="animate-fade-up">
          <Logo />
        </div>
        <div className="flex flex-1 flex-col pb-10 pt-14 sm:justify-center sm:pt-10 lg:max-w-[26rem]">{children}</div>
        <p className="text-xs leading-relaxed text-white/75 lg:max-w-[26rem]">
          By continuing, you agree to Model Spawn&apos;s{" "}
          <Link href="/terms" className="text-white/85 underline underline-offset-2 hover:text-white">Terms of Service</Link>{" "}
          and acknowledge you&apos;ve read our{" "}
          <Link href="/privacy" className="text-white/85 underline underline-offset-2 hover:text-white">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
