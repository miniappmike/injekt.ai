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
        <header className="sticky top-0 z-10 border-b border-neutral-800/80 bg-neutral-950/75 backdrop-blur-xl max-sm:border-transparent">
          <div className="mx-auto flex max-w-6xl 2xl:max-w-[88rem] items-center gap-3 px-4 py-2 max-sm:h-14 sm:flex-col sm:gap-1 sm:px-6 sm:pt-2.5 sm:pb-1.5">
            <Link href="/marketplace" aria-label="Model Spawn marketplace" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
              <Logo />
            </Link>
            <nav aria-label="Account" className="ml-auto flex items-center gap-2 sm:ml-0">
              <Link href="/login?next=/marketplace" className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
                Log in
              </Link>
              <Link href="/signup" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-neutral-950 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                Sign up
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl 2xl:max-w-[88rem] p-4 pb-28 sm:p-6">{children}</main>
      </div>
    );
  }

  const [{ enabled: generation, hasImageKey, confirmed }, plan] = await Promise.all([loadGenerationState(supabase, user.id), entitlements.planOf(user.id)]);
  return (
    <AppProvider value={{ generation, imageKey: hasImageKey, generationConfirmed: confirmed }}>
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
