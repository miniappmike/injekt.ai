import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure } from "@/lib/ai/failure";
import { runInject } from "@/lib/inject-run";
import type { InjectOptionsInput } from "@/lib/inject-meta";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Writes Inject prompts for one target, streaming the model's words as they arrive so the page can show them being
 * written. The answer is newline-delimited JSON: {"t":"d","v":"text…"} for each piece, then {"t":"done","result":…}
 * with the same result as the writeInjectPrompts action. Same rate limit and daily allowance as that action.
 */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  let input: { characterId: string; targetPath: string; options: InjectOptionsInput };
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          // The browser went away; the work still finishes and is saved to History.
        }
      };
      try {
        await enforceRateLimit(user.id, "llm", 20, 60);
        // One target photo is one run of today's allowance, given back if the writing fails.
        const result = await withDaily(supabase, user.id, "runs", () => runInject(supabase, user.id, input, Math.random, (v) => send({ t: "d", v })));
        send({ t: "done", result: { ok: true, ...result } });
      } catch (e) {
        send({ t: "done", result: toFailure(e) });
      }
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
