import { AppHeader } from "@/components/app-header";
import { AppProvider } from "@/components/app-context";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { OutOfTokens } from "@/components/out-of-tokens";
import { SiteHeader } from "@/components/front/site-header";
import { MobileDock } from "@/components/mobile-nav";
import { HistoryPanel } from "@/components/history-panel";
import { entitlements } from "@/lib/entitlements";
import { loadGenerationState } from "@/lib/generation-access";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Pages anyone can open (the marketplace). Signed in, you get the normal top bar and phone dock; signed out, the landing
 * pages' header. Unlike the (app) layout, this never redirects.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen">
        {/* The same header as the landing pages, so the site reads as one. */}
        <SiteHeader />
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
        <OutOfTokens />
      </div>
    </AppProvider>
  );
}
