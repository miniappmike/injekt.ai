import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { entitlements } from "@/lib/entitlements";

/**
 * Shared guard and helpers for every admin-only marketplace server action. "use server" files may only export async
 * functions, so these live here in a plain server-only module and the action files import them.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** A message that is safe and useful to show the admin. Anything else becomes a generic message. */
export class ActionError extends Error {}

/** The server-side admin check. Hiding buttons is never the protection; every action calls this first. */
export async function requireAdmin() {
  const { user } = await requireUser();
  if ((await entitlements.planOf(user.id)) !== "admin") throw new ActionError("Admins only.");
  return user;
}

/** Runs an action body after the admin check and turns thrown ActionErrors into `{ ok: false, error }`. */
export async function run<T extends object>(fn: (adminId: string) => Promise<T>, tag = "listing-actions"): Promise<Result<T>> {
  try {
    const user = await requireAdmin();
    return { ok: true, ...(await fn(user.id)) };
  } catch (e) {
    // requireUser() redirects by throwing; let that through.
    if (e instanceof Error && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error(`[${tag}]`, e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const idSchema = z.string().uuid();
export const parseId = (v: unknown) => {
  const r = idSchema.safeParse(v);
  if (!r.success) throw new ActionError("That item couldn't be found.");
  return r.data;
};
export const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details and try again.";

/** The database's own rule messages, in plain English. */
export function friendly(message: string | undefined): string {
  const m = message ?? "";
  if (/listing_sold/.test(m)) return "This persona is sold, so it can't be changed.";
  if (/listing_reserved/.test(m)) return "Someone is checking out with this persona right now. Try again in a few minutes.";
  if (/price/.test(m)) return "That price isn't allowed. Use $0.50 to $100,000.";
  return "Couldn't save that. Try again.";
}
