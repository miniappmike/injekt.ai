import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/main-nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-neutral-800 bg-neutral-950/90 px-4 py-2 backdrop-blur">
        <Link href="/characters" className="font-semibold">Model Spawn</Link>
        <MainNav />
        <div className="ml-auto flex items-center gap-3">
          <Link href="/settings/api-keys" className="text-sm text-neutral-400 hover:text-neutral-100">API keys</Link>
          <span className="hidden text-sm text-neutral-500 sm:inline">{user.email}</span>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">Log out</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
