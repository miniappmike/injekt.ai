import { LoadingMark } from "@/components/boot-splash";

/**
 * Shown while a page's data loads: the page's shape in shimmering blocks, so switching tabs feels instant, and if it
 * takes longer than a moment a dim cover with the flashing M fades in over it (quick switches never show it).
 */
export default function Loading() {
  return (
    <div className="max-w-3xl animate-fade-in" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton mt-4 h-24" />
      <div className="skeleton mt-4 h-10 w-40" />
      <LoadingMark className="fixed inset-0 z-40 animate-[fade-in_300ms_ease_700ms_both]" />
    </div>
  );
}
