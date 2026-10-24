"use server";

import { requireUser } from "@/lib/auth";
import { getSpendOverview, getTypicalCosts, type SpendOverview, type TypicalCost } from "@/lib/spend";

// The browser sends its own timezone offset (minutes behind UTC) so "today" means the person's today.
const validOffset = (n: unknown): n is number => Number.isInteger(n) && Math.abs(n as number) <= 14 * 60;

/** What has been spent, per job. With `details`, also asks the provider (free) for the balance and image prices. */
export async function getSpend(input: { tzOffsetMinutes: number; details?: boolean }): Promise<SpendOverview | null> {
  try {
    const { supabase, user } = await requireUser();
    if (!validOffset(input?.tzOffsetMinutes)) return null;
    return await getSpendOverview(supabase, user.id, { tzOffsetMinutes: input.tzOffsetMinutes, details: input.details === true });
  } catch (e) {
    console.error("spend overview failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** What each action typically costs, for the hints next to buttons. */
export async function getTypicalCostList(): Promise<TypicalCost[]> {
  try {
    const { supabase, user } = await requireUser();
    return await getTypicalCosts(supabase, user.id);
  } catch (e) {
    console.error("typical costs failed", e instanceof Error ? e.message : e);
    return [];
  }
}
