"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GENERATION_EVENT, openHistory, viewImage, type TrayGeneration } from "@/lib/panel-events";

// A strip along the bottom of the page with every image generated on it, newest first. It empties when you go to
// another page or refresh; everything is still in History > Images.
export function GenerationTray() {
  const pathname = usePathname();
  const [items, setItems] = useState<TrayGeneration[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const update = (e as CustomEvent<TrayGeneration>).detail;
      setItems((list) => {
        const at = list.findIndex((i) => i.key === update.key);
        if (at === -1) return [update, ...list];
        const next = [...list];
        next[at] = { ...next[at], ...update };
        return next;
      });
    };
    window.addEventListener(GENERATION_EVENT, onUpdate);
    return () => window.removeEventListener(GENERATION_EVENT, onUpdate);
  }, []);

  // A new page starts with an empty tray.
  useEffect(() => {
    setItems([]);
    setCollapsed(false);
  }, [pathname]);

  if (!items.length) return null;
  const running = items.filter((i) => i.state === "generating").length;

  return (
    <>
      {/* Keeps the end of the page from hiding behind the tray. */}
      <div aria-hidden="true" className={collapsed ? "h-12" : "h-36"} />
      <section
        aria-label="Images generated on this page"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 px-4 py-2 shadow-[0_-8px_24px_rgba(0,0,0,0.4)] backdrop-blur"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            On this page: {items.length} image{items.length === 1 ? "" : "s"}
            {running > 0 && <span className="font-normal text-neutral-400"> · {running} generating</span>}
          </p>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => openHistory("images")}>All images</Button>
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
                    onClick={() => viewImage({ url: i.url as string, downloadUrl: i.downloadUrl, prompt: i.prompt, title: i.label })}
                    className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                    aria-label={`View ${i.label} image`}
                    title={i.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.url} alt="" className="h-20 w-20 rounded-md object-cover" />
                  </button>
                ) : (
                  <div
                    title={i.state === "failed" ? i.error : i.label}
                    className={`flex h-20 w-20 items-center justify-center rounded-md px-1 text-center text-xs ${
                      i.state === "failed" ? "bg-red-950 text-red-300" : "animate-pulse bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {i.state === "failed" ? "Failed" : "Generating..."}
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
