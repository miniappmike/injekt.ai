"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { VIEW_IMAGE_EVENT, type ViewableImage } from "@/lib/panel-events";

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
// Room kept for the toolbar at the bottom and the buttons at the top when fitting the image.
const FIT_MARGIN = { x: 48, y: 176 };

// Full-screen image viewer, opened with viewImage(). Drag to move, scroll or pinch to zoom, double-click to switch
// between fitting the screen and actual size.
export function ImageViewer() {
  const [image, setImage] = useState<ViewableImage | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScaleState] = useState(1);
  // The current scale, readable synchronously so a zoom can work out how far to move the image.
  const scaleRef = useRef(1);
  const setScale = useCallback((next: number) => {
    scaleRef.current = next;
    setScaleState(next);
  }, []);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const { toast, show } = useToast(2000);

  useEffect(() => {
    const onView = (e: Event) => {
      const detail = (e as CustomEvent<ViewableImage>).detail;
      if (!detail?.url) return;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setNatural(null);
      setPos({ x: 0, y: 0 });
      setImage(detail);
    };
    window.addEventListener(VIEW_IMAGE_EVENT, onView);
    return () => window.removeEventListener(VIEW_IMAGE_EVENT, onView);
  }, []);

  const fitScale = useCallback(() => {
    if (!natural) return 1;
    const w = window.innerWidth - FIT_MARGIN.x;
    const h = window.innerHeight - FIT_MARGIN.y;
    return clamp(Math.min(w / natural.w, h / natural.h));
  }, [natural]);

  const fit = useCallback(() => {
    setScale(fitScale());
    setPos({ x: 0, y: 0 });
  }, [fitScale, setScale]);

  useEffect(() => {
    if (natural) fit();
  }, [natural, fit]);

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setImage(null);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!image) return;
    closeButton.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [image]);

  // Zooms by `factor`, keeping the point under (cx, cy) (relative to the stage centre) still.
  const zoomAt = useCallback(
    (factor: number, cx = 0, cy = 0) => {
      const s = scaleRef.current;
      const next = clamp(s * factor);
      const ratio = next / s;
      setScale(next);
      setPos((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
    },
    [setScale],
  );

  const fromCentre = (clientX: number, clientY: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  };

  // Native listener so the page under the viewer never scrolls (React's wheel handler is passive).
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = fromCentre(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0015), c.x, c.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, zoomAt]);

  function onPointerDown(e: React.PointerEvent) {
    stage.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: React.PointerEvent) {
    const all = pointers.current;
    const prev = all.get(e.pointerId);
    if (!prev) return;
    if (all.size === 1) {
      setPos((p) => ({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
    } else if (all.size === 2) {
      // Pinch: zoom by how much the distance between the two fingers changed, around their midpoint.
      const other = [...all.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) {
        const c = fromCentre((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
        zoomAt(after / before, c.x, c.y);
      }
    }
    all.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      return close();
    }
    if (e.key === "+" || e.key === "=") zoomAt(1.25);
    else if (e.key === "-") zoomAt(0.8);
    else if (e.key === "0") fit();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await overlay.current?.requestFullscreen();
    } catch {
      // Some browsers refuse full screen inside frames; the viewer still works without it.
    }
  }

  if (!image) return null;

  return createPortal(
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label={image.title ?? "Image"}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-neutral-100"
    >
      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={fit}>Fit to screen</Button>
        <Button type="button" size="sm" variant="secondary" onClick={toggleFullscreen}>{fullscreen ? "Exit full screen" : "Full screen"}</Button>
        <Button ref={closeButton} type="button" size="sm" variant="secondary" onClick={close} aria-label="Close image">Close ✕</Button>
      </div>

      <div
        ref={stage}
        className="relative flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if (Math.abs(scale - fitScale()) > 0.01) return fit();
          const c = fromCentre(e.clientX, e.clientY);
          zoomAt(1 / scale, c.x, c.y);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.title ?? ""}
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="absolute left-1/2 top-1/2 max-w-none"
          style={{
            transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
            visibility: natural ? "visible" : "hidden",
          }}
        />
        {!natural && <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Loading...</p>}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 p-3">
        <div className="flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => zoomAt(0.8)} aria-label="Zoom out">−</Button>
          <span className="w-12 text-center text-sm tabular-nums" aria-live="polite">{natural ? `${Math.round(scale * 100)}%` : ""}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => zoomAt(1.25)} aria-label="Zoom in">+</Button>
        </div>
        {image.downloadUrl && (
          <Button asChild size="sm" variant="secondary">
            <a href={image.downloadUrl}>Download</a>
          </Button>
        )}
        {image.prompt && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(image.prompt as string);
              show("Prompt copied");
            }}
          >
            Copy prompt
          </Button>
        )}
      </div>
      {toast}
    </div>,
    document.body,
  );
}
