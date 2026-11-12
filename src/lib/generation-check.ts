"use client";

import { checkImageGeneration } from "@/app/(app)/generate/actions";

/**
 * One check of an image job, shared by everything on the page that watches it (the Generate panel, the tray and
 * History). Calls for the same job within a few seconds share one server request, and a finished answer is kept, so a
 * job is checked about once every POLL_MS however many places are watching.
 */
export const POLL_MS = 6000;
const SHARE_MS = 5000;

type Result = Awaited<ReturnType<typeof checkImageGeneration>>;
const recent = new Map<string, { at: number; p: Promise<Result> }>();
const done = new Map<string, Result>();

export function checkGeneration(id: string): Promise<Result> {
  const finished = done.get(id);
  if (finished) return Promise.resolve(finished);
  const hit = recent.get(id);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.p;
  const p = checkImageGeneration(id).then(
    (r) => {
      if (r.ok && (r.state === "complete" || r.state === "failed")) done.set(id, r);
      return r;
    },
    (e) => {
      recent.delete(id); // a dropped request is tried again on the next check
      throw e;
    },
  );
  recent.set(id, { at: Date.now(), p });
  return p;
}

/** For tests. */
export function resetGenerationChecks() {
  recent.clear();
  done.clear();
}
