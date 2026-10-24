"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTypicalCostList } from "@/app/(app)/spend/actions";
import { formatUsd } from "@/lib/pricing";
import { SPEND_EVENT } from "@/lib/spend-events";
import type { TypicalCost } from "@/lib/spend";

// One shared copy of the list, refreshed whenever something is spent, so many hints cost one request.
let cache: Record<string, TypicalCost> | null = null;
let loading: Promise<void> | null = null;
let listening = false;
const subscribers = new Set<() => void>();

function load() {
  loading ??= getTypicalCostList()
    .then((list) => {
      cache = Object.fromEntries(list.map((t) => [t.feature, t]));
      subscribers.forEach((notify) => notify());
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function useTypicalCost(feature: string): TypicalCost | null | undefined {
  const [, rerender] = useState(0);
  useEffect(() => {
    const notify = () => rerender((n) => n + 1);
    subscribers.add(notify);
    if (!listening) {
      window.addEventListener(SPEND_EVENT, () => void load());
      listening = true;
    }
    if (!cache) void load();
    return () => void subscribers.delete(notify);
  }, []);
  // undefined while loading, null when this action has no entry
  return cache ? (cache[feature] ?? null) : undefined;
}

/** A small line next to an action that says roughly what running it will cost on the person's own key. */
export function CostHint({ feature, count = 1 }: { feature: string; count?: number }) {
  const typical = useTypicalCost(feature);
  if (typical === undefined || typical === null) return null;

  if (typical.cost === null) {
    return (
      <p className="text-xs text-neutral-500">
        Cost unknown. <Link href="/settings/api-keys" className="underline">Add this model&apos;s price</Link> to see it here.
      </p>
    );
  }
  const total = typical.cost * count;
  const each = count > 1 ? ` (${count} × ${formatUsd(typical.cost)})` : "";
  return (
    <p className="text-xs text-neutral-500">
      {typical.basis === "history"
        ? `About ${formatUsd(total)}${each} · average of your last ${typical.runs} run${typical.runs === 1 ? "" : "s"}`
        : `Roughly ${formatUsd(total)}${each} · an estimate until you've run it once`}
    </p>
  );
}
