import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { ModelRefusedToast, PageModelBox } from "@/components/page-model";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { PasteRouter } from "@/components/paste-router";
import { MobileDock } from "@/components/mobile-nav";
import { HistoryPanel } from "@/components/history-panel";
import { requireUser } from "@/lib/auth";
import { AppProvider } from "@/components/app-context";
import { entitlements } from "@/lib/entitlements";
import { loadGenerationState } from "@/lib/generation-access";

// Opening the Images tab finishes any job that completed while you were away, which downloads and stores the image.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await requireUser();
  const [{ enabled: generation, hasImageKey, confirmed }, plan] = await Promise.all([loadGenerationState(supabase, user.id), entitlements.planOf(user.id)]);
  return (
    <AppProvider value={{ generation, imageKey: hasImageKey, generationConfirmed: confirmed }}>
      <div className="min-h-screen">
        <AppHeader email={user.email ?? "Account"} admin={plan === "admin"} />
        {/* The footer below leaves the room for the phone dock and the generation tray. */}
        <main className="mx-auto max-w-6xl 2xl:max-w-[88rem] p-4 pb-10 max-sm:pt-1 sm:p-6 sm:pb-12">{children}</main>
        <PageModelBox />
        <AppFooter />
        <ModelRefusedToast />
        <MobileDock />
        <HistoryPanel />
        {generation && <GenerationTray />}
        <ImageViewer />
        <PasteRouter />
      </div>
    </AppProvider>
  );
}
