"use client";

import { waitOrWake } from "@/lib/pending-generations";

/**
 * Waits for a long server call that a phone may cut off (Safari in the background, the app switched, the page
 * suspended). If the call never answers, or fails on the way back, `recover` asks the server whether the work got
 * done anyway (it saves what it made), first when the page is back in view and then every so often.
 * Resolves with the call's answer or the recovered one; rejects only when neither comes before `timeoutMs`.
 */
export function awaitOrRecover<T>(call: Promise<T>, recover: () => Promise<T | null>, o: { firstCheckMs?: number; everyMs?: number; timeoutMs?: number } = {}): Promise<T> {
  const { firstCheckMs = 45_000, everyMs = 10_000, timeoutMs = 4 * 60_000 } = o;
  const started = Date.now();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let callFailed: unknown = null;
    let wasHidden = document.visibilityState === "hidden";
    const done = (v: T) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      resolve(v);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") wasHidden = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Wakes the loop early: the call failed, so there is no reason to keep waiting before looking.
    let kick: () => void = () => {};

    call.then(done, (e) => {
      callFailed = e ?? new Error("The request failed.");
      kick();
    });

    void (async () => {
      while (!settled && Date.now() - started < timeoutMs) {
        const wait = callFailed || wasHidden ? everyMs : Math.max(1000, firstCheckMs - (Date.now() - started));
        await Promise.race([waitOrWake(wait), new Promise<void>((r) => (kick = r))]);
        if (settled) return;
        // Only look once it could plausibly be stuck: the page was away, the call failed, or it is taking long.
        if (!wasHidden && !callFailed && Date.now() - started < firstCheckMs) continue;
        try {
          const got = await recover();
          if (got !== null) return done(got);
        } catch {
          // Couldn't reach the server either; try again.
        }
      }
      if (!settled) {
        settled = true;
        document.removeEventListener("visibilitychange", onVisibility);
        reject(callFailed ?? new Error("This is taking too long. Check History in a minute; it may still finish."));
      }
    })();
  });
}
