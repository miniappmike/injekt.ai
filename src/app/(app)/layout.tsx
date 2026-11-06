import { AppHeader } from "@/components/app-header";
import { GenerationTray } from "@/components/generation-tray";
import { ImageViewer } from "@/components/image-viewer";
import { requireUser } from "@/lib/auth";

// Opening the Images tab finishes any job that completed while you were away, which downloads and stores the image.
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen">
      <AppHeader email={user.email ?? "Account"} />
      <main className="mx-auto max-w-6xl p-4 sm:p-6 sm:pt-8">{children}</main>
      <GenerationTray />
      <ImageViewer />
    </div>
  );
}
