import { ChevronDown } from "lucide-react";
import { FAQS } from "@/lib/faq";
import { cn } from "@/lib/utils";
import { GLASS, SectionHeading } from "./parts";

/** Questions that open in place. Plain <details>, so it works without any script. */
export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-28">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      <div className={cn(GLASS, "mt-8 divide-y divide-white/10 px-5 sm:px-7")}>
        {FAQS.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-left text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-white/60 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="max-w-3xl pb-5 text-[15px] leading-relaxed text-white/75">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
