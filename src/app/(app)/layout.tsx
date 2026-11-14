import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { ModelRefusedToast, PageModelBox } from "@/components/page-model";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { OutOfTokens } from "@/components/out-of-tokens";
import { PasteRouter } from "@/components/paste-router";
import { MobileDock } from "@/components/mobile-nav";
import { HistoryPanel } from "@/components/history-panel";
import { requireUser } from "@/lib/auth";
import { AppProvider } from "@/components/app-context";
import { entitlements, loadProfile } from "@/lib/entitlements";
import { RenewBanner, bannerWindow } from "@/components/renew-banner";
import { adminClient } from "@/lib/supabase/admin";
import { loadGenerationState } from "@/lib/generation-access";

// Opening the Images tab finishes any job that completed while you were away, which downloads and stores the image.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await requireUser();
  const [{ enabled: generation, hasImageKey, confirmed }, plan, profile] = await Promise.all([
    loadGenerationState(supabase, user.id),
    entitlements.planOf(user.id),
    loadProfile(user.id),
  ]);
  // Only when the reminder is due: was their latest Pro paid with Telegram (which renews by itself)?
  let autoRenews = false;
  if (bannerWindow(profile?.proUntil ?? null)) {
    const { data } = await adminClient().from("orders").select("provider").eq("user_id", user.id).eq("kind", "pro").eq("status", "paid").order("paid_at", { ascending: false }).limit(1).maybeSingle();
    autoRenews = data?.provider === "telegram";
  }
  return (
    <AppProvider value={{ generation, imageKey: hasImageKey, generationConfirmed: confirmed, pro: plan !== "free", billing: plan !== "free" && hasImageKey ? "own" : "credits" }}>
      <div className="min-h-screen">
        <AppHeader email={user.email ?? "Account"} admin={plan === "admin"} />
        <RenewBanner proUntil={profile?.proUntil ?? null} manualPro={profile?.manualPro ?? false} autoRenews={autoRenews} />
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
        <OutOfTokens />
      </div>
    </AppProvider>
  );
}
