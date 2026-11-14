/**
 * The heading at the top of a tool page. Wide screens get the title and the full description. Phones already show the
 * page's name in the top bar, so they get one short line instead (or nothing, when the page opens with its own guide).
 */
export function PageIntro({ title, short, children }: { title: string; short?: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400 max-sm:hidden">{children}</p>
      {short && <p className="text-[13px] leading-snug text-neutral-400 sm:hidden">{short}</p>}
    </>
  );
}
