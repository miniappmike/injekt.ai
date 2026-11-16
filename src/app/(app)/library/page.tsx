import { PageIntro } from "@/components/page-intro";
import { Library } from "@/components/library";

export const metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <div>
      <PageIntro title="Library" short="Every image you've made that is still active.">
        Every image you&apos;ve made that is still active (kept 72 hours). Tick images to download, pin, send to Variants or delete them.
      </PageIntro>
      <Library />
    </div>
  );
}
