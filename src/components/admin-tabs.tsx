import Link from "next/link";
import { cn } from "@/lib/utils";

export const ADMIN_TABS = [
  { id: "orders", label: "Orders" },
  { id: "people", label: "People" },
  { id: "limits", label: "Limits" },
  { id: "costs", label: "Costs" },
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number]["id"];
export const parseTab = (v: unknown): AdminTab => (ADMIN_TABS.some((t) => t.id === v) ? (v as AdminTab) : "orders");

/**
 * Admin's sections, one page each. On phones it's four equal buttons that stay under the top bar as you scroll; on
 * computers, underlined tabs.
 */
export function AdminTabs({ tab }: { tab: AdminTab }) {
  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-14 z-[9] -mx-4 grid grid-cols-4 gap-1 border-b border-neutral-800 bg-neutral-950/90 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mt-4 sm:flex sm:gap-1 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
    >
      {ADMIN_TABS.map((t) => (
        <Link
          key={t.id}
          href={`/admin?tab=${t.id}`}
          aria-current={t.id === tab ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors sm:-mb-px sm:rounded-none sm:border-b-2 sm:px-4 sm:py-2.5",
            t.id === tab
              ? "bg-neutral-100 text-neutral-950 sm:border-brand-500 sm:bg-transparent sm:text-neutral-50"
              : "text-neutral-400 hover:text-neutral-100 sm:border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
