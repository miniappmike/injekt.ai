import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import { HistoryPanel } from "@/components/history-panel";
import { ProfileMenu } from "@/components/profile-menu";
import { Logo } from "@/components/logo";

/** The bar along the top of every signed-in page: the mark, the page tabs, History and the profile menu. */
export function AppHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
        <Link href="/characters" aria-label="Model Spawn home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
          <Logo />
        </Link>
        <MainNav />
        <div className="ml-auto flex items-center gap-2">
          <HistoryPanel />
          <ProfileMenu email={email} />
        </div>
      </div>
    </header>
  );
}
