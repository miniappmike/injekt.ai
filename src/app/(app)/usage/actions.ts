"use server";

import { requireUser } from "@/lib/auth";
import { dailyStatus, type DailyStatus } from "@/lib/daily-limits";

/** Credits, plan and (on the free plan) today's use against the daily limits, for the header meter. */
export async function getDailyUsage(): Promise<DailyStatus | null> {
  try {
    const { supabase, user } = await requireUser();
    return await dailyStatus(supabase, user.id, { emailConfirmed: !!user.email_confirmed_at });
  } catch {
    return null;
  }
}
