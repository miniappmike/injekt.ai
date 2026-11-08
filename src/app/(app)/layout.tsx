import { AppHeader } from "@/components/app-header";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { MobileDock } from "@/components/mobile-nav";
import { requireUser } from "@/lib/auth";
import { AppProvider } from "@/components/app-context";
import { entitlements } from "@/lib/entitlements";
import { loadGenerationState } from "@/lib/generation-access";

// Opening the Images tab finishes any job that completed while you were away, which downloads and stores the image.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await requireUser();
  const [{ enabled: generation }, plan] = await Promise.all([loadGenerationState(supabase, user.id), entitlements.planOf(user.id)]);
  return (
    <AppProvider value={{ generation }}>
      <div className="min-h-screen">
        <AppHeader email={user.email ?? "Account"} admin={plan === "admin"} />
        <main className="mx-auto max-w-6xl p-4 pb-28 max-sm:pt-1 sm:p-6">{children}</main>
        <MobileDock />
        {generation && <GenerationTray />}
        <ImageViewer />
      </div>
    </AppProvider>
  );
}
