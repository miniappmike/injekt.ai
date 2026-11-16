"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Unfinished work that survives the page being reloaded. A phone closes a web app that sits in the background, and
 * everything typed or picked would be gone when it reopens. Text and choices are kept in localStorage; picked photos
 * (too big for that) in IndexedDB. Both are per browser and forgotten after DRAFT_HOURS.
 */
export const DRAFT_HOURS = 24;
const MAX_AGE_MS = DRAFT_HOURS * 3_600_000;
const PREFIX = "ms.draft.";

export function readDraft<T>(key: string): T | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFIX + key) || "null") as { v: T; at: number } | null;
    if (!saved || typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) return null;
    return saved.v;
  } catch {
    return null;
  }
}

/** Saves a draft; null or undefined removes it. */
export function writeDraft(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, at: Date.now() }));
  } catch {
    // Private window or full storage: the page works, it just won't remember.
  }
}

interface DraftOptions<T> {
  /** Checks (and may repair) what was saved; return null to ignore it, for example a character that was deleted. */
  decode?: (saved: unknown) => T | null;
  /** How to save a value JSON can't hold (a Set). */
  encode?: (value: T) => unknown;
  /** Don't restore: something else already chose the starting value (a link that names the character). */
  skip?: boolean;
}

/**
 * useState that remembers. It starts from `initial` (so the server and the first paint agree), then takes the saved
 * value if there is one, and saves every change after that.
 */
export function useDraftState<T>(key: string, initial: T | (() => T), o: DraftOptions<T> = {}): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const options = useRef(o);
  options.current = o;
  // The first save is skipped: it would write the starting value over the saved one before that has been restored.
  const first = useRef(true);
  useEffect(() => {
    if (options.current.skip) return;
    const saved = readDraft<unknown>(key);
    if (saved === null) return;
    const v = options.current.decode ? options.current.decode(saved) : (saved as T);
    if (v !== null) setValue(v);
  }, [key]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    writeDraft(key, options.current.encode ? options.current.encode(value) : value);
  }, [key, value]);
  return [value, setValue];
}

/** For a Set of known ids: saved as a list, and ids that no longer exist are dropped. */
export const setDraft = <T extends string>(allowed: readonly T[]): Pick<DraftOptions<Set<T>>, "encode" | "decode"> => ({
  encode: (s) => [...s],
  decode: (saved) => (Array.isArray(saved) ? new Set(saved.filter((x): x is T => allowed.includes(x as T))) : null),
});

/** For one of a fixed list of values. */
export const oneOf = <T,>(allowed: readonly T[]) => ({ decode: (saved: unknown) => (allowed.includes(saved as T) ? (saved as T) : null) });

// Picked photos.

export interface DraftFile {
  id: string;
  file: File;
}
const DB = "ms-drafts";
const STORE = "files";
/** Above this the photos aren't kept (the phone's storage is the person's, not ours to fill). */
const MAX_BYTES = 80 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Replaces the photos kept under `key`; an empty list removes them. Never throws. */
export async function putDraftFiles(key: string, files: DraftFile[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const keep = files.length > 0 && files.reduce((n, f) => n + f.file.size, 0) <= MAX_BYTES;
      if (keep) tx.objectStore(STORE).put({ at: Date.now(), files }, key);
      else tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    // No IndexedDB (private window) or no room: the photos just aren't remembered.
  }
}

/** The photos kept under `key`, or none if there aren't any or they are too old. Never throws. */
export async function getDraftFiles(key: string): Promise<DraftFile[]> {
  try {
    const db = await openDb();
    const saved = await new Promise<{ at: number; files: DraftFile[] } | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!saved || Date.now() - saved.at > MAX_AGE_MS) return [];
    return saved.files.filter((f) => f?.file instanceof Blob && typeof f.id === "string");
  } catch {
    return [];
  }
}
