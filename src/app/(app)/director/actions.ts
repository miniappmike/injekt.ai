"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { withDaily } from "@/lib/daily-limits";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { UserFacingError } from "@/lib/errors";
import { isOwnPath } from "@/lib/uploads";
import { loadForVision } from "@/lib/character-images";
import { getUserTextClient, withDeclineFallback } from "@/lib/ai/text-client";
import { looksLikeRefusal } from "@/lib/ai/refusal";
import { directorEditTask, MAX_EDIT_CHANGES } from "@/lib/ai/prompts/director-edit";

const EDGE = 1024;

/** Director "Edit a photo": reads the photo and writes an edit prompt from the person's words. Counts as one prompt run. */
export async function writeDirectorEdit(input: { photoPath: string; changes: string; keepHer: boolean }): Promise<{ ok: true; text: string } | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await enforceRateLimit(user.id, "llm", 20, 60);
    const changes = String(input.changes ?? "").trim().slice(0, MAX_EDIT_CHANGES);
    if (!changes) throw new UserFacingError("Describe what should change first.");
    if (typeof input.photoPath !== "string" || !isOwnPath(user.id, input.photoPath)) throw new UserFacingError("Add the photo again.");
    const text = await withDaily(supabase, user.id, "runs", async () => {
      const { client, imageMaxEdge, model } = await getUserTextClient(supabase, user.id, "vision", "prompt");
      const [photo] = await loadForVision(supabase, [{ label: "the photo to edit", path: input.photoPath }], Math.min(EDGE, imageMaxEdge ?? EDGE));
      const task = { prompt: directorEditTask(changes, !!input.keepHer), images: [photo.dataUri] };
      const out = String(await withDeclineFallback(supabase, user.id, "prompt", { client, model }, "llm", (cl) => cl.run(task))).trim();
      if (!out || looksLikeRefusal(out)) throw new UserFacingError("Couldn't write that edit. Try again, or press Generate to use your own words.");
      return out.slice(0, MAX_EDIT_CHANGES);
    });
    return { ok: true, text };
  } catch (e) {
    return toFailure(e);
  }
}
