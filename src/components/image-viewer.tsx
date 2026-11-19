"use client";

import { DownloadLink } from "@/components/download-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EyeIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { PinToReferences } from "@/components/pin-to-references";
import { getPinTarget } from "@/app/(app)/characters/pin-actions";
import { deleteGeneration } from "@/app/(app)/history/actions";
import { generationDeleted, SEND_TO_VARIANTS_EVENT, SEND_TO_VARIANTS_KEY, VIEW_IMAGE_EVENT, type ViewableImage } from "@/lib/panel-events";

// Which character each generated image can be pinned to, remembered so stepping between images shows Pin It at once.
const pinCache = new Map<string, string | null>();

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
// Room kept around the picture when fitting it: the buttons at the top lie over the stage, and the same again below
// keeps it centred. Phones get a thinner side margin.
const fitMargin = (w: number) => ({ x: w < 640 ? 16 : 48, y: 112 });
// How much of the picture always stays on screen, so it can't be dragged or flicked out of reach.
const KEEP_VISIBLE = 80;
// Touch: how far a finger may wander and still count as a tap, how close two taps must be to be a double tap, and how
// far a sideways swipe must go to step to the next picture.
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 32;
const SWIPE_DISTANCE = 64;
const DOUBLE_TAP_ZOOM = 2.5;

type View = { s: number; x: number; y: number };

// Full-screen image viewer, opened with viewImage(). Mouse: drag to move, scroll to zoom, double-click to switch
// between fitting the screen and actual size. Touch: pinch to zoom, drag to move, double tap to recentre (or zoom in
// when it is already centred), swipe sideways to step through the gallery, tap outside the picture to close.
export function ImageViewer() {
  const [image, setImage] = useState<ViewableImage | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Scale and position together, also readable synchronously so a gesture can build on the last frame.
  const [view, setViewState] = useState<View>({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  // Glides to the new view (fit, double tap, snapping back) instead of jumping; off while a finger is down.
  const [smooth, setSmooth] = useState(false);
  // Blurred pictures stay blurred here until Show is pressed (per picture, only while the viewer is open).
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!image) setShown(new Set());
  }, [image]);
  // True while the picture sits fitted and centred: a sideways swipe then steps through the gallery.
  const atFit = useRef(true);
  const scale = view.s;
  const [fullscreen, setFullscreen] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const naturalRef = useRef(natural);
  naturalRef.current = natural;
  const { toast, show } = useToast(2000);
  // The character this image was made for, so Pin It can be offered wherever the image is opened from.
  const router = useRouter();
  const pathname = usePathname();

  // Copies the picture itself. Clipboards take PNG, so a JPEG is redrawn as one (from the file, so nothing is tainted).
  async function copyImage(urls: (string | null | undefined)[]) {
    try {
      // Tries each address in turn (the download link, then the plain one); one may be refused by the browser.
      const tryUrls = urls.filter((u): u is string => !!u);
      // Directly first; if the picture's host won't let this page read it (a TypeError), through the site itself
      // (/api/image-copy, for the person's own pictures only).
      const attempts = [
        ...tryUrls.map((u) => () => fetch(u, { mode: "cors", credentials: "omit" })),
        ...tryUrls.filter((u) => /^https?:/.test(u)).map((u) => () => fetch(`/api/image-copy?u=${encodeURIComponent(u)}`)),
      ];
      const png = (async () => {
        let last: unknown = new Error("load");
        for (const attempt of attempts) {
          try {
            const r = await attempt();
            if (r.ok) return await r.blob();
            last = new Error(String(r.status));
          } catch (err) {
            last = err;
          }
        }
        throw last;
      })()
        .then(async (blob) => {
          if (blob.type === "image/png") return blob;
          const bmp = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bmp.width;
          canvas.height = bmp.height;
          canvas.getContext("2d")!.drawImage(bmp, 0, 0);
          return new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
        });
      // The promise goes straight into the ClipboardItem, so the copy still counts as part of the click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      show("Image copied");
    } catch (err) {
      console.error("Copy image failed", err);
      const why = err instanceof Error && err.name && err.name !== "Error" ? ` (${err.name})` : err instanceof TypeError ? " (the picture's address refused the copy)" : "";
      show(`Couldn't copy the image${why}. Use Download instead.`);
    }
  }

  // Deletes this generated image from storage (after asking), then shows the next one in the gallery, or closes.
  const [deleting, setDeleting] = useState(false);
  async function deleteCurrent(img: ViewableImage) {
    if (!img.generationId || !window.confirm("Delete this image? It is removed from storage everywhere and can't be brought back.")) return;
    setDeleting(true);
    const r = await deleteGeneration(img.generationId);
    setDeleting(false);
    if (!r.ok) return show(r.error);
    generationDeleted(img.generationId);
    pinCache.delete(img.generationId);
    const list = img.gallery ?? [];
    const at = list.findIndex((x) => x.url === img.url);
    const rest = list.filter((x) => x.url !== img.url);
    router.refresh();
    if (!rest.length) return close();
    setNatural(null);
    setImage({ ...rest[Math.min(Math.max(at, 0), rest.length - 1)], gallery: rest });
  }

  // Opens Variants with this picture in its "Generated image" slot.
  function sendToVariants(img: ViewableImage) {
    try {
      sessionStorage.setItem(SEND_TO_VARIANTS_KEY, JSON.stringify({ generationId: img.generationId ?? null, url: img.downloadUrl ?? img.url }));
    } catch {
      return show("Couldn't open Variants in this window.");
    }
    close();
    if (pathname.startsWith("/variants")) window.dispatchEvent(new Event(SEND_TO_VARIANTS_EVENT));
    else router.push("/variants");
  }

  useEffect(() => {
    const onView = (e: Event) => {
      const detail = (e as CustomEvent<ViewableImage>).detail;
      if (!detail?.url) return;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setNatural(null);
      setImage(detail);
    };
    window.addEventListener(VIEW_IMAGE_EVENT, onView);
    return () => window.removeEventListener(VIEW_IMAGE_EVENT, onView);
  }, []);

  // Keeps part of the picture on screen whatever the gesture asked for.
  const setView = useCallback((next: View, glide = false) => {
    const n = naturalRef.current;
    const r = stage.current?.getBoundingClientRect();
    let { x, y } = next;
    if (n && r) {
      const limX = Math.max(0, (n.w * next.s + r.width) / 2 - KEEP_VISIBLE);
      const limY = Math.max(0, (n.h * next.s + r.height) / 2 - KEEP_VISIBLE);
      x = Math.min(limX, Math.max(-limX, x));
      y = Math.min(limY, Math.max(-limY, y));
    }
    const v = { s: next.s, x, y };
    viewRef.current = v;
    setSmooth(glide);
    setViewState(v);
  }, []);

  const fitScale = useCallback(() => {
    if (!natural) return 1;
    const r = stage.current?.getBoundingClientRect();
    const w = r?.width || window.innerWidth;
    const h = r?.height || window.innerHeight;
    const m = fitMargin(w);
    return clamp(Math.min((w - m.x) / natural.w, (h - m.y) / natural.h));
  }, [natural]);

  const fit = useCallback(
    (glide = false) => {
      atFit.current = true;
      setView({ s: fitScale(), x: 0, y: 0 }, glide);
    },
    [fitScale, setView],
  );

  useEffect(() => {
    if (natural) fit();
  }, [natural, fit]);

  // Turning the phone or resizing the window refits a picture that was fitted.
  useEffect(() => {
    if (!natural) return;
    const onResize = () => {
      if (atFit.current) fit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [natural, fit]);

  // Steps to the next (1) or previous (-1) picture of the gallery, wrapping round.
  const step = useCallback(
    (dir: 1 | -1) => {
      const list = image?.gallery;
      if (!image || !list || list.length < 2) return false;
      const at = Math.max(0, list.findIndex((x) => x.url === image.url));
      setNatural(null);
      setImage({ ...list[(at + dir + list.length) % list.length], gallery: list });
      return true;
    },
    [image],
  );

  const generationId = image?.generated ? image.generationId : null;
  // Looked up for this image and, in the background, for the others in its gallery, so the button is already there
  // when you step to the next picture instead of appearing after the other buttons.
  const [, pinTick] = useState(0);
  const galleryIds = (image?.gallery ?? []).map((x) => (x.generated ? x.generationId : null)).filter((x): x is string => !!x).join(",");
  useEffect(() => {
    const ids = [...new Set([generationId, ...galleryIds.split(",")].filter((x): x is string => !!x && !pinCache.has(x)))];
    if (!ids.length) return;
    let alive = true;
    void (async () => {
      for (const id of ids) {
        const characterId = await getPinTarget(id);
        pinCache.set(id, characterId);
        if (alive) pinTick((n) => n + 1);
      }
    })();
    return () => {
      alive = false;
    };
  }, [generationId, galleryIds]);
  const pinKnown = !!generationId && pinCache.has(generationId);
  const pinCharacter = generationId ? pinCache.get(generationId) ?? null : null;

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
    // Safari's own two-finger page zoom would fight the viewer's pinch.
    const noPageZoom = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", noPageZoom);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("gesturestart", noPageZoom);
    };
  }, [image]);

  // Esc closes the viewer wherever focus is (clicking or dragging the picture moves focus off the viewer), before
  // anything underneath, such as the History panel, sees it.
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
        if (!step(e.key === "ArrowRight" ? 1 : -1)) return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "Escape") return;
      // In full screen the browser uses Esc to leave it; the viewer stays open.
      if (document.fullscreenElement) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [image, close, step]);

  // Zooms by `factor`, keeping the point under (cx, cy) (relative to the stage centre) still.
  const zoomAt = useCallback(
    (factor: number, cx = 0, cy = 0, glide = false) => {
      const v = viewRef.current;
      const next = clamp(v.s * factor);
      const ratio = next / v.s;
      atFit.current = false;
      setView({ s: next, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }, glide);
    },
    [setView],
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

  // The gesture in progress: where the first finger went down, whether it was on the picture, whether the picture was
  // fitted then, and whether a second finger joined (a pinch is never a tap or a swipe).
  const press = useRef<{ x: number; y: number; onImage: boolean; touch: boolean; wasFit: boolean; pinched: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastPointerType = useRef("mouse");

  // Closing on a tap leaves the browser's follow-up click with nothing under the finger but the page, where it would
  // open whatever is there (often the same picture again). That one click is swallowed.
  function closeFromTap() {
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      done();
    };
    const done = () => window.removeEventListener("click", swallow, true);
    window.addEventListener("click", swallow, true);
    window.setTimeout(done, 400);
    close();
  }

  function onPointerDown(e: React.PointerEvent) {
    lastPointerType.current = e.pointerType;
    setSmooth(false);
    if (pointers.current.size === 0) {
      // Read before capture: once captured, every event's target is the stage.
      press.current = {
        x: e.clientX,
        y: e.clientY,
        onImage: (e.target as HTMLElement).tagName === "IMG",
        touch: e.pointerType === "touch",
        wasFit: atFit.current,
        pinched: false,
      };
    } else if (press.current) {
      press.current.pinched = true;
    }
    stage.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: React.PointerEvent) {
    const all = pointers.current;
    const prev = all.get(e.pointerId);
    if (!prev) return;
    const v = viewRef.current;
    if (all.size === 1) {
      const p = press.current;
      // A finger resting on the glass jitters; don't let that nudge a fitted picture off centre.
      if (p && !p.pinched && Math.hypot(e.clientX - p.x, e.clientY - p.y) < TAP_SLOP) return;
      atFit.current = false;
      setView({ s: v.s, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y });
    } else if (all.size === 2) {
      // Pinch: zoom by how much the two fingers moved apart, around their midpoint, and follow the midpoint as it
      // moves, so two fingers can zoom and pan in one motion.
      const other = [...all.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0 && after > 0) {
        const c0 = fromCentre((prev.x + other.x) / 2, (prev.y + other.y) / 2);
        const c1 = fromCentre((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
        const next = clamp(v.s * (after / before));
        const ratio = next / v.s;
        atFit.current = false;
        setView({ s: next, x: c1.x - (c0.x - v.x) * ratio, y: c1.y - (c0.y - v.y) * ratio });
      }
    }
    all.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    const p = press.current;
    press.current = null;
    if (!p || e.type !== "pointerup") return p?.touch && viewRef.current.s < fitScale() ? fit(true) : undefined;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const tap = !p.pinched && Math.hypot(dx, dy) < TAP_SLOP;

    if (tap && !p.onImage) return p.touch ? closeFromTap() : close();
    if (!p.touch) return;

    if (tap) {
      const now = Date.now();
      const last = lastTap.current;
      if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_SLOP) {
        lastTap.current = null;
        // Double tap: back to fitted and centred; from there, zoom in on the spot that was tapped.
        if (!atFit.current) return fit(true);
        const c = fromCentre(e.clientX, e.clientY);
        return zoomAt(DOUBLE_TAP_ZOOM, c.x, c.y, true);
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      return;
    }
    lastTap.current = null;

    // A fitted picture swiped sideways steps through the gallery; otherwise it settles back in the centre.
    if (p.wasFit && !p.pinched) {
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5 && step(dx < 0 ? 1 : -1)) return;
      return fit(true);
    }
    // Pinched smaller than the screen: spring back to fitted.
    if (viewRef.current.s <= fitScale() * 1.02) fit(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "+" || e.key === "=") zoomAt(1.25, 0, 0, true);
    else if (e.key === "-") zoomAt(0.8, 0, 0, true);
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

  const gallery = image.gallery && image.gallery.length > 1 ? image.gallery : null;
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  // Phones: every action is a full-height button sharing the row evenly, so the bar is tidy rows of big targets.
  const action = "max-sm:h-11 max-sm:min-w-[30%] max-sm:flex-1";

  return createPortal(
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label={image.title ?? "Image"}
      onKeyDown={onKeyDown}
      // The empty parts of the bars around the picture close it too.
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.viewerBar !== undefined) close();
      }}
      // Solid backdrop: blurring the page behind a picture that is being zoomed left stale strips of it on phones.
      className="fixed inset-0 z-50 flex animate-fade-in flex-col overscroll-contain bg-black text-neutral-100 sm:bg-black/95"
    >
      <div data-viewer-bar className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" className="max-sm:hidden" onClick={() => fit(true)}>Fit to screen</Button>
        {canFullscreen && (
          <Button type="button" size="sm" variant="secondary" className="max-sm:hidden" onClick={toggleFullscreen}>{fullscreen ? "Exit full screen" : "Full screen"}</Button>
        )}
        <Button ref={closeButton} type="button" size="sm" variant="secondary" className="max-sm:h-11 max-sm:px-4" onClick={close} aria-label="Close image">Close ✕</Button>
      </div>

      <div
        ref={stage}
        className="relative flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        style={{ WebkitTouchCallout: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          // Touch has its own double tap (above).
          if (lastPointerType.current === "touch") return;
          if (Math.abs(scale - fitScale()) > 0.01) return fit(true);
          const c = fromCentre(e.clientX, e.clientY);
          zoomAt(1 / scale, c.x, c.y, true);
        }}
      >
        {/* Sized in real pixels and only moved by the transform: a picture scaled by a transform was drawn from
            stale tiles on phones, which left lines where its edges had been. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.title ?? ""}
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className={`absolute left-1/2 top-1/2 max-w-none will-change-transform ${smooth ? "transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none" : ""}`}
          style={{
            filter: image.blurred && !shown.has(image.url) ? "blur(28px)" : undefined,
            width: natural ? natural.w * scale : undefined,
            height: natural ? natural.h * scale : undefined,
            transform: `translate3d(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px), 0)`,
            visibility: natural ? "visible" : "hidden",
          }}
        />
        {!natural && <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Loading...</p>}
        {natural && image.blurred && !shown.has(image.url) && (
          <button
            type="button"
            data-viewer-bar
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShown((cur) => new Set(cur).add(image.url));
            }}
            className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgb(232_38_94/0.7)] transition-all hover:from-brand-300 hover:to-brand-500 active:scale-95"
          >
            <EyeIcon className="h-[18px] w-[18px]" />
            Show image
          </button>
        )}
      </div>

      <div data-viewer-bar className="flex flex-wrap items-center justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/90 px-2 py-1 shadow-lg max-sm:hidden">
          <Button type="button" size="sm" variant="ghost" onClick={() => zoomAt(0.8, 0, 0, true)} aria-label="Zoom out">−</Button>
          <span className="w-12 text-center text-sm tabular-nums" aria-live="polite">{natural ? `${Math.round(scale * 100)}%` : ""}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => zoomAt(1.25, 0, 0, true)} aria-label="Zoom in">+</Button>
        </div>
        {gallery && (
          <div data-viewer-bar className="flex items-center justify-center gap-1 max-sm:basis-full">
            <Button type="button" size="sm" variant="ghost" className="max-sm:h-11 max-sm:w-11 max-sm:text-lg" onClick={() => step(-1)} aria-label="Previous image">‹</Button>
            <span className="rounded-full border border-neutral-800 bg-neutral-900/90 px-3 py-1.5 text-xs tabular-nums text-neutral-300" aria-live="polite" title="Left and right arrow keys, or swipe">
              {Math.max(0, gallery.findIndex((x) => x.url === image.url)) + 1} / {gallery.length}
            </span>
            <Button type="button" size="sm" variant="ghost" className="max-sm:h-11 max-sm:w-11 max-sm:text-lg" onClick={() => step(1)} aria-label="Next image">›</Button>
          </div>
        )}
        {/* Always offered, on every preview: falls back to the shown image when there is no separate download address. */}
        <Button asChild size="sm" variant="secondary" className={action}>
          <DownloadLink href={image.downloadUrl ?? image.url}>Download</DownloadLink>
        </Button>
        <Button type="button" size="sm" variant="secondary" className={action} onClick={() => void copyImage([image.url, image.downloadUrl])}>
          Copy image
        </Button>
        {image.prompt && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={action}
            onClick={async () => {
              await navigator.clipboard.writeText(image.prompt as string);
              show("Prompt copied");
            }}
          >
            Copy prompt
          </Button>
        )}
        {generationId && !pinKnown && <span aria-hidden="true" className={`h-8 w-16 animate-pulse rounded-lg bg-neutral-800 ${action}`} />}
        {generationId && pinCharacter && <PinToReferences key={generationId} generationId={generationId} characterId={pinCharacter} className="max-sm:min-w-[30%] max-sm:flex-1" buttonClassName="max-sm:h-11 max-sm:w-full" />}
        {generationId && (
          <Button type="button" size="sm" variant="secondary" className={`text-red-300 ${action}`} disabled={deleting} onClick={() => void deleteCurrent(image)}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        )}
        {image.generated && (
          <Button type="button" size="sm" className={action} onClick={() => sendToVariants(image)}>
            Variants
          </Button>
        )}
      </div>
      {toast}
    </div>,
    document.body,
  );
}
