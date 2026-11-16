import { PageIntro } from "@/components/page-intro";
import { Library } from "@/components/library";
import { LibraryTabs } from "@/components/library-tabs";
import { PromptLibrary } from "@/components/prompt-library";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "prompts" ? "prompts" : "images";
  return (
    <div>
      <PageIntro title="Library" short="Your images and prompts.">
        Every image you&apos;ve made that is still active (kept 72 hours), and every prompt you&apos;ve saved.
      </PageIntro>
      <LibraryTabs tab={tab} />
      {tab === "images" ? <Library /> : <PromptLibrary />}
    </div>
  );
}
