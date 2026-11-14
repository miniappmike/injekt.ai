import Link from "next/link";
import { X } from "lucide-react";
import { FrontStage, TO_LANDING } from "@/components/front/stage";
import { Logo } from "@/components/logo";

/** Log in and sign up, in front of the backdrop they share with the landing page (see ../layout.tsx). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <FrontStage>
      <main className="flex min-h-dvh flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-8 sm:px-8 lg:max-w-6xl lg:px-12 lg:pb-8 lg:pt-10">
          <div className="flex animate-fade-up items-center justify-between">
            <Logo />
            <Link
              href="/"
              transitionTypes={TO_LANDING}
              aria-label="Close and go back to the home page"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-white/85 shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] backdrop-blur-xl transition-colors duration-150 hover:border-white/30 hover:bg-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
          <div className="flex flex-1 flex-col pb-10 pt-14 sm:justify-center sm:pt-10 lg:max-w-[26rem]">{children}</div>
          <p className="text-xs leading-relaxed text-white/75 lg:max-w-[26rem]">
            By continuing, you agree to ModelSpawn&apos;s{" "}
            <Link href="/terms" className="text-white/85 underline underline-offset-2 hover:text-white">Terms of Service</Link>{" "}
            and acknowledge you&apos;ve read our{" "}
            <Link href="/privacy" className="text-white/85 underline underline-offset-2 hover:text-white">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </FrontStage>
  );
}
