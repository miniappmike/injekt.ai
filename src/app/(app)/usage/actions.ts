"use server";

import { requireUser } from "@/lib/auth";
import { dailyStatus, type DailyStatus } from "@/lib/daily-limits";

/** Today's prompt runs and likeness checks against the plan's allowance, for the header meter. */
export async function getDailyUsage(): Promise<DailyStatus | null> {
  try {
    const { supabase, user } = await requireUser();
    return await dailyStatus(supabase, user.id);
  } catch {
    return null;
  }
}
