import Link from "next/link";
import { MainNav } from "@/components/main-nav";
import { HistoryPanel } from "@/components/history-panel";
import { ProfileMenu } from "@/components/profile-menu";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { requireUser } from "@/lib/auth";

// Opening the Images tab finishes any job that completed while you were away, which downloads and stores the image.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-neutral-800 bg-neutral-950/90 px-4 py-2 backdrop-blur">
        <Link href="/characters" className="font-semibold">Model Spawn</Link>
        <MainNav />
        <div className="ml-auto flex items-center gap-3">
          <HistoryPanel />
          <ProfileMenu email={user.email ?? "Account"} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      <GenerationTray />
      <ImageViewer />
    </div>
  );
}
