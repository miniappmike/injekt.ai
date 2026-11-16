import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "images", label: "Images", href: "/library" },
  { id: "prompts", label: "Prompts", href: "/library?tab=prompts" },
] as const;

/** Images and Prompts, the Library's two tabs. */
export function LibraryTabs({ tab }: { tab: "images" | "prompts" }) {
  return (
    <div role="tablist" aria-label="Library" className="mt-5 flex gap-1 border-b border-neutral-800">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          role="tab"
          aria-selected={tab === t.id}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            tab === t.id ? "border-brand-500 text-neutral-50" : "border-transparent text-neutral-400 hover:border-neutral-600 hover:text-neutral-100",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
