import { useId } from "react";

// A small (i) that explains itself on hover, keyboard focus and tap. No script needed.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-bold leading-none text-neutral-200 hover:bg-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        // Not just invisible but taken out of the layout while hidden, so it never widens the page on a phone.
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 max-w-[80vw] -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-900 p-2 text-xs font-normal text-neutral-200 shadow-lg group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}
