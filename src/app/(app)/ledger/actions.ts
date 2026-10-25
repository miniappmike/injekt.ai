"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getLedgerEntries, getLedgerSummary, rangeStart, spendWindows } from "@/lib/ledger";
import type { LedgerEntry, PlatformSpend } from "@/lib/ledger-types";

const input = z.object({
  // The browser's own offset, so "today" and "this month" mean the person's today and month.
  tzOffsetMinutes: z.number().int().min(-14 * 60).max(14 * 60),
  platform: z.string().trim().min(1).max(100).optional(),
  job: z.enum(["vision", "llm", "image"]).optional(),
  range: z.enum(["today", "week", "month", "all"]),
  /** Only entries newer than this one: how the page stays live. */
  afterId: z.number().int().positive().optional(),
  /** Only entries older than this one: "Load more". */
  beforeId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export interface LedgerPage {
  summary: PlatformSpend[];
  entries: LedgerEntry[];
  hasMore: boolean;
}

/** Totals per platform plus a page of entries, both for the person signed in. Null if it could not be read. */
export async function getLedger(raw: unknown): Promise<LedgerPage | null> {
  try {
    const { supabase } = await requireUser();
    const q = input.parse(raw);
    const now = new Date();
    const windows = spendWindows(now, q.tzOffsetMinutes);
    const [summary, page] = await Promise.all([
      getLedgerSummary(supabase, windows, q.job),
      getLedgerEntries(supabase, {
        platform: q.platform,
        job: q.job,
        since: rangeStart(q.range, now, windows),
        afterId: q.afterId,
        beforeId: q.beforeId,
        limit: q.limit,
      }),
    ]);
    return { summary, ...page };
  } catch (e) {
    console.error("ledger read failed", e instanceof Error ? e.message : e);
    return null;
  }
}
