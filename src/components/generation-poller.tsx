"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { checkImageGeneration } from "@/app/(app)/generate/actions";

// Keeps checking the unfinished generations on the page and refreshes it when one finishes or fails.
export function GenerationPoller({ ids }: { ids: string[] }) {
  const router = useRouter();
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    let stopped = false;
    let ticks = 0;
    const timer = setInterval(async () => {
      if (stopped || ++ticks > 75) return clearInterval(timer);
      const results = await Promise.all(key.split(",").map((id) => checkImageGeneration(id)));
      if (stopped) return;
      if (results.some((r) => !r.ok || r.state === "complete" || r.state === "failed")) {
        stopped = true;
        clearInterval(timer);
        router.refresh();
      }
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [key, router]);

  return null;
}
