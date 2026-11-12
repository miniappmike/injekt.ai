import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import { ProfileMenu } from "@/components/profile-menu";
import { Logo } from "@/components/logo";
import { UsageMeter } from "@/components/usage-meter";
import { MobileTitle } from "@/components/mobile-nav";

/** The bar along the top of every signed-in page: the mark, the page tabs, History and the profile menu. */
export function AppHeader({ email, admin = false }: { email: string; admin?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/75 backdrop-blur-xl max-sm:border-transparent">
      {/* Phones: one row (title left, tools right). Tablet and up: two centred rows, the mark and tabs over the tools bar. */}
      <div className="relative mx-auto flex max-w-6xl 2xl:max-w-[88rem] items-center gap-x-3 gap-y-0.5 px-4 py-2 max-sm:h-14 sm:flex-col sm:gap-x-6 sm:px-6 sm:pt-2.5 sm:pb-1.5">
        {/* Phones: mark or back arrow, the page's name in the middle, and square buttons; the tools are in the dock. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
          <MobileTitle />
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-x-6 max-sm:hidden">
          <Link href="/characters" aria-label="ModelSpawn home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            <Logo />
          </Link>
          <MainNav />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <UsageMeter />
          <ProfileMenu email={email} admin={admin} />
        </div>
      </div>
    </header>
  );
}
