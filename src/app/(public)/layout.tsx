import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AppProvider } from "@/components/app-context";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { Logo } from "@/components/logo";
import { MobileDock } from "@/components/mobile-nav";
import { HistoryPanel } from "@/components/history-panel";
import { entitlements } from "@/lib/entitlements";
import { loadGenerationState } from "@/lib/generation-access";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Pages anyone can open (the marketplace). Signed in, you get the normal top bar and phone dock; signed out, a small
 * header with Log in and Sign up. Unlike the (app) layout, this never redirects.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen">
        {/* One row at every width: logo on the left, account actions on the right, with room to breathe around both. */}
        <header className="sticky top-0 z-10 border-b border-neutral-800/70 bg-neutral-950/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl 2xl:max-w-[88rem] items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6">
            <Link href="/marketplace" aria-label="ModelSpawn marketplace" className="-ml-1 shrink-0 rounded-lg p-1 max-[359px]:[&_.font-display]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
              <Logo />
            </Link>
            <nav aria-label="Account" className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <Link href="/login?next=/marketplace" className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 sm:px-5">
                Log in
              </Link>
              <Link href="/signup" className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-bold text-neutral-950 shadow-[0_4px_18px_rgb(255_255_255/0.08)] transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-6">
                Sign up
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl 2xl:max-w-[88rem] px-4 pb-16 pt-6 sm:px-6 sm:pb-24 sm:pt-10">{children}</main>
        <ImageViewer />
      </div>
    );
  }

  const [{ enabled: generation, hasImageKey, confirmed }, plan] = await Promise.all([loadGenerationState(supabase, user.id), entitlements.planOf(user.id)]);
  return (
    <AppProvider value={{ generation, imageKey: hasImageKey, generationConfirmed: confirmed, pro: plan !== "free", billing: plan !== "free" && hasImageKey ? "own" : "credits" }}>
      <div className="min-h-screen">
        <AppHeader email={user.email ?? "Account"} admin={plan === "admin"} />
        <main className="mx-auto max-w-6xl 2xl:max-w-[88rem] p-4 pb-44 max-sm:pt-1 sm:p-6 sm:pb-28">{children}</main>
        <MobileDock />
        <HistoryPanel />
        {generation && <GenerationTray />}
        <ImageViewer />
      </div>
    </AppProvider>
  );
}
