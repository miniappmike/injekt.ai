import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden p-4">
      {/* Soft crimson and blue light behind the card. */}
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(232_38_94/0.18),transparent_60%)] blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-[60%] top-[30%] -z-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgb(91_91_246/0.16),transparent_60%)] blur-2xl" />
      <div className="animate-fade-up">
        <Logo />
      </div>
      {children}
    </main>
  );
}
