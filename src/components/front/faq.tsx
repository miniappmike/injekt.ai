import { ChevronDown } from "lucide-react";
import { FAQ_GROUPS } from "@/lib/faq";
import { cn } from "@/lib/utils";
import { GLASS, SectionHeading } from "./parts";

const slug = (title: string) => `faq-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;

/** Questions that open in place. Plain <details>, so it works without any script. */
export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-40 md:scroll-mt-28">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      {/* Jump straight to a group. */}
      <nav aria-label="FAQ sections" className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
        {FAQ_GROUPS.map((group) => (
          <a
            key={group.title}
            href={`#${slug(group.title)}`}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/85 backdrop-blur-xl transition-colors hover:border-white/30 hover:bg-white/[0.14] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {group.title}
          </a>
        ))}
      </nav>
      <div className="mt-8 flex flex-col gap-8">
        {FAQ_GROUPS.map((group) => (
          <div key={group.title} id={slug(group.title)} className="scroll-mt-40 md:scroll-mt-28">
            <h3 className="mb-3 text-lg font-semibold text-white">{group.title}</h3>
            <div className={cn(GLASS, "divide-y divide-white/10 px-5 sm:px-7")}>
              {group.items.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-left text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-white/60 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="max-w-3xl pb-5 text-[15px] leading-relaxed text-white/75">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
