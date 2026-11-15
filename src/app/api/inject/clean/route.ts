import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { toFailure } from "@/lib/ai/failure";
import { cleanTarget } from "@/lib/overlay-cleanup";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "Clean up overlays" for one target photo. A plain route instead of a server action: the browser runs server actions
 * one at a time, so a slow clean-up held up every other action on the page (image progress checks, Pin It, and so on).
 */
export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    let path = "";
    try {
      path = String((await req.json())?.path ?? "");
    } catch {
      return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
    }
    await enforceRateLimit(user.id, "llm", 20, 60);
    return Response.json({ ok: true, ...(await cleanTarget(supabase, user.id, path)) });
  } catch (e) {
    return Response.json(toFailure(e));
  }
}
