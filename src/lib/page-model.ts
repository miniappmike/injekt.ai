"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * The one-off image model a page uses instead of the one in Settings (the "Model for this page" box). Each page keeps
 * its own for this browser tab, so a refresh keeps it and other pages are unaffected. Empty means the Settings model.
 */
const EVENT = "ms:page-model";
const key = (path: string) => `ms.pageModel:${path}`;
export const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*){1,3}$/i;

function read(path: string): string {
  try {
    return sessionStorage.getItem(key(path)) ?? "";
  } catch {
    return "";
  }
}

export function usePageModel(): [string, (v: string) => void] {
  const path = usePathname();
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue(read(path));
    const on = (e: Event) => (e as CustomEvent<{ path: string; value: string }>).detail.path === path && setValue((e as CustomEvent<{ value: string }>).detail.value);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [path]);
  const set = useCallback(
    (v: string) => {
      try {
        if (v) sessionStorage.setItem(key(path), v);
        else sessionStorage.removeItem(key(path));
      } catch {
        // Private window: it lasts until the page changes.
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { path, value: v } }));
    },
    [path],
  );
  return [value, set];
}

/** The model a Generate button should send: the page's, when it is a valid ID. */
export function usePageModelForRequest(): string | undefined {
  const [value] = usePageModel();
  const v = value.trim();
  return v && MODEL_ID_RE.test(v) ? v : undefined;
}

/** A generation was refused because of its model. The toast in the layout shows it. */
export const MODEL_REFUSED_EVENT = "ms:model-refused";
export type ModelRefused = { reason: "model_not_allowed" | "model_not_found"; model: string | null };
export const reportModelRefused = (detail: ModelRefused) => window.dispatchEvent(new CustomEvent(MODEL_REFUSED_EVENT, { detail }));
