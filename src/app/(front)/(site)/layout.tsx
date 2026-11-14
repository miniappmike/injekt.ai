import { SiteFooter } from "@/components/front/site-footer";
import { SiteHeader } from "@/components/front/site-header";
import { FrontStage } from "@/components/front/stage";

/** The landing pages (home, How It Works, About): the glass header and footer in front of the shared backdrop. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <FrontStage>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </FrontStage>
  );
}
