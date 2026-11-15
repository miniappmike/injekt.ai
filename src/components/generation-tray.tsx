"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { checkGeneration, POLL_MS } from "@/lib/generation-check";

const MAX_POLLS = 75; // about 10 minutes
import { GENERATION_DELETED_EVENT, GENERATION_EVENT, openHistory, viewImage, type TrayGeneration } from "@/lib/panel-events";
import { generationsOnPage } from "@/lib/pending-generations";

// A strip along the bottom of the page with every image generated on it, newest first. It empties when you go to
// another page or refresh; everything is still in History > Images.
export function GenerationTray() {
  const pathname = usePathname();
  // The Create Model wizard shows each result right where it was made, so the tray would only repeat it there.
  const hiddenHere = pathname.startsWith("/reference-sheet");
  const [items, setItems] = useState<TrayGeneration[]>([]);
  // On phones it starts as a small pill, so the black strip doesn't sit over the page; tap it for the thumbnails.
  const [collapsed, setCollapsed] = useState(false);
  const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  // Adds a generation, or merges news about one already in the tray.
  const update = useCallback((u: Partial<TrayGeneration> & { key: string }) => {
    setItems((list) => {
      const at = list.findIndex((i) => i.key === u.key);
      if (at === -1) return [u as TrayGeneration, ...list];
      const next = [...list];
      next[at] = { ...next[at], ...u };
      return next;
    });
  }, []);

  useEffect(() => {
    const onUpdate = (e: Event) => update((e as CustomEvent<TrayGeneration>).detail);
    // A deleted image leaves the tray too.
    const onDeleted = (e: Event) => setItems((list) => list.filter((i) => i.generationId !== (e as CustomEvent<string>).detail));
    window.addEventListener(GENERATION_EVENT, onUpdate);
    window.addEventListener(GENERATION_DELETED_EVENT, onDeleted);
    return () => {
      window.removeEventListener(GENERATION_EVENT, onUpdate);
      window.removeEventListener(GENERATION_DELETED_EVENT, onDeleted);
    };
  }, [update]);

  // A new page starts with only the jobs started on it in this tab (remembered across a reload, which a phone can do
  // when you switch apps); they are checked again and show their image once ready.
  useEffect(() => {
    setItems(
      generationsOnPage(pathname).map((p) => ({ key: p.key, label: p.label, prompt: p.prompt, state: "generating" as const, generationId: p.generationId, detached: true })),
    );
    setCollapsed(isPhone());
  }, [pathname]);

  // Jobs whose Generate button went away are checked from here until they finish.
  const watchKey = items
    .filter((i) => i.state === "generating" && i.detached && i.generationId)
    .map((i) => `${i.key}:${i.generationId}`)
    .join(",");
  useEffect(() => {
    if (!watchKey) return;
    let stopped = false;
    let ticks = 0;
    const tick = async () => {
      if (stopped || ++ticks > MAX_POLLS) return clearInterval(timer);
      await Promise.all(
        watchKey.split(",").map(async (pair) => {
          const [key, id] = pair.split(":");
          const status = await checkGeneration(id).catch(() => null);
          if (stopped || !status) return;
          if (!status.ok) return; // A check that errors is tried again on the next tick.
          if (status.state === "complete") update({ key, state: "ready", url: status.url, downloadUrl: status.downloadUrl });
          else if (status.state === "failed") update({ key, state: "failed", error: status.error });
        }),
      );
    };
    const timer = setInterval(tick, POLL_MS);
    void tick(); // A job picked back up after a reload may already be done.
    // Back on the tab or app: check at once instead of waiting for the next tick.
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [watchKey]);

  // Tells the floating History button how tall the tray is, so it floats just above it.
  const tray = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = tray.current;
    const root = document.documentElement;
    if (!el) return;
    const set = () => root.style.setProperty("--tray-h", `${el.offsetHeight + 12}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--tray-h");
    };
  }, [items.length > 0 && !hiddenHere]);

  // The tray keeps tracking jobs while hidden, so a sheet started on one wizard step still lands in History if she moves on.
  if (!items.length || hiddenHere) return null;
  const running = items.filter((i) => i.state === "generating").length;

  return (
    <>
      {/* Keeps the end of the page from hiding behind the tray. */}
      <div aria-hidden="true" className={collapsed ? "h-12 max-sm:h-2" : "h-36"} />
      <section
        ref={tray}
        aria-label="Images generated on this page"
        className={`fixed inset-x-0 bottom-0 z-30 animate-fade-up border-t border-neutral-800/80 bg-neutral-950/85 px-4 py-2 shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl max-sm:bottom-[5.25rem] max-sm:rounded-2xl max-sm:border ${
          collapsed ? "max-sm:left-auto max-sm:right-3 max-sm:rounded-full max-sm:py-1 max-sm:pl-3 max-sm:pr-1" : "max-sm:inset-x-3"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            <span className={collapsed ? "max-sm:hidden" : ""}>On this page: </span>{items.length} image{items.length === 1 ? "" : "s"}
            {running > 0 && <span className={`font-normal text-neutral-400 ${collapsed ? "max-sm:hidden" : ""}`}> · {running} generating</span>}
            {collapsed && running > 0 && <span aria-hidden="true" className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-400 sm:hidden" />}
          </p>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" className={collapsed ? "max-sm:hidden" : ""} onClick={() => openHistory("images")}>All images</Button>
            <Button type="button" size="sm" variant="ghost" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? "Show" : "Hide"}
            </Button>
          </div>
        </div>
        {!collapsed && (
          <ul className="mt-1 flex gap-2 overflow-x-auto pb-1">
            {items.map((i) => (
              <li key={i.key} className="shrink-0">
                {i.state === "ready" && i.url ? (
                  <button
                    type="button"
                    onClick={() => {
                      const shot = (x: TrayGeneration) => ({ url: x.url as string, downloadUrl: x.downloadUrl, prompt: x.prompt, title: x.label, generated: true, generationId: x.generationId });
                      // The tray's ready images, so the viewer's arrow keys step through them in the tray's order.
                      viewImage({ ...shot(i), gallery: items.filter((x) => x.state === "ready" && x.url).map(shot) });
                    }}
                    className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                    aria-label={`View ${i.label} image`}
                    title={i.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.url} alt="" className="thumb h-20 w-20 animate-pop-in object-cover ring-1 ring-white/10" />
                  </button>
                ) : (
                  <div
                    title={i.state === "failed" ? i.error : i.label}
                    className={`flex h-20 w-20 flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-center text-[11px] leading-tight ${
                      i.state === "failed" ? "bg-red-950/70 text-red-300 ring-1 ring-red-500/30" : "skeleton text-neutral-300 ring-1 ring-brand-500/30"
                    }`}
                  >
                    {i.state === "failed" ? "Failed" : (<><Spinner className="h-5 w-5 text-brand-400" />Generating</>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
