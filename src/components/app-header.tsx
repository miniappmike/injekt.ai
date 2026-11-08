import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import { HistoryPanel } from "@/components/history-panel";
import { ProfileMenu } from "@/components/profile-menu";
import { Logo } from "@/components/logo";
import { UsageMeter } from "@/components/usage-meter";
import { MobileTitle } from "@/components/mobile-nav";

/** The bar along the top of every signed-in page: the mark, the page tabs, History and the profile menu. */
export function AppHeader({ email, admin = false }: { email: string; admin?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/75 backdrop-blur-xl max-sm:border-transparent">
      <div className="relative mx-auto flex max-w-6xl items-center gap-x-6 gap-y-1 px-4 py-2 max-sm:h-14 max-sm:gap-x-3 sm:flex-wrap sm:px-6">
        {/* Phones: mark or back arrow, the page's name in the middle, and square buttons; the tools are in the dock. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
          <MobileTitle />
        </div>
        <Link href="/characters" aria-label="Model Spawn home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 max-sm:hidden">
          <Logo />
        </Link>
        <div className="max-sm:hidden">
          <MainNav />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <UsageMeter />
          <HistoryPanel />
          <ProfileMenu email={email} admin={admin} />
        </div>
      </div>
    </header>
  );
}
