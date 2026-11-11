import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { FREE_CREDITS } from "@/lib/plans";
import { InsufficientCreditsError } from "@/lib/errors";

/** A spend that can be given back once (when the job it paid for failed). */
export interface CreditSpend {
  id: string | null;
  refund(): Promise<void>;
}
export const NO_SPEND: CreditSpend = { id: null, refund: async () => {} };

// Before migration 0023 runs the functions don't exist: nothing is charged, so the site keeps working while it's set up.
const missing = (e: { message?: string; code?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01" || /credit_|spend_credits|refund_credits|grant_signup_credits/.test(e.message ?? ""));
let warned = false;
const warnMissing = () => {
  if (!warned) console.warn("[credits] credits aren't set up yet (run migration 0023); not charging");
  warned = true;
};

/** Credits the person can spend now. Gives the free credits first, once, when their email is confirmed. */
export async function creditBalance(userId: string, opts: { emailConfirmed?: boolean } = {}): Promise<number | null> {
  const db = adminClient();
  if (opts.emailConfirmed) await db.rpc("grant_signup_credits", { p_user: userId, p_amount: FREE_CREDITS });
  const { data, error } = await db.rpc("credit_balance", { p_user: userId });
  if (error) {
    if (missing(error)) return null;
    throw new Error("Couldn't load your credits. Try again.");
  }
  return Number(data ?? 0);
}

/** Takes `amount` credits, or throws InsufficientCreditsError. */
export async function spendCredits(userId: string, amount: number, reason: string, ref?: string): Promise<CreditSpend> {
  const db = adminClient();
  const { data, error } = await db.rpc("spend_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_ref: ref ?? null });
  if (error) {
    if (missing(error)) {
      warnMissing();
      return NO_SPEND;
    }
    throw new Error("Couldn't check your credits. Try again.");
  }
  if (!data) {
    const balance = (await creditBalance(userId)) ?? 0;
    throw new InsufficientCreditsError(amount, balance);
  }
  return spendHandle(data as string);
}

/** A handle for a spend made earlier (its id is kept on the job), to give it back. */
export function spendHandle(id: string): CreditSpend {
  let done = false;
  return {
    id,
    refund: async () => {
      if (done) return;
      done = true;
      await adminClient().rpc("refund_credits", { p_spend: id });
    },
  };
}

/** Runs `fn` on `amount` credits, given back if it throws. */
export async function withCredits<T>(userId: string, amount: number, reason: string, fn: () => Promise<T>): Promise<T> {
  const spend = await spendCredits(userId, amount, reason);
  try {
    return await fn();
  } catch (e) {
    await spend.refund().catch(() => {});
    throw e;
  }
}
