"use server";

import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { entitlements } from "@/lib/entitlements";
import { saveHistory } from "@/lib/history";
import { isOwnPath } from "@/lib/uploads";
import { toFailure, type AiFailure } from "@/lib/ai/failure";
import { prepareVision } from "@/lib/ai/vision-run";
import { buildLikenessTask, likenessReportText, parseLikenessReport, type LikenessReport } from "@/lib/ai/tasks/likeness";

export async function checkLikeness(input: {
  characterId: string;
  imagePath: string;
  promptUsed?: string;
}): Promise<({ ok: true } & { report: LikenessReport }) | AiFailure> {
  try {
    const { supabase, user } = await requireUser();
    await entitlements.requirePro(user.id, "likeness");
    if (!isOwnPath(user.id, input.imagePath)) return { ok: false, error: "Add the generated image to check." };
    await enforceRateLimit(user.id, "llm", 20, 60);

    const { client, character, references, extras } = await prepareVision(supabase, user.id, input.characterId, [
      { label: "generated image", path: input.imagePath },
    ], "likeness");
    if (!character) return { ok: false, error: "Pick a character." };

    const reply = await client.run(
      buildLikenessTask({ character, references, generated: extras[0], promptUsed: input.promptUsed }),
    );
    const report = parseLikenessReport(reply);

    await saveHistory(supabase, user.id, [
      {
        characterId: input.characterId,
        kind: "likeness",
        label: `Likeness · ${character.name} · ${report.overall}/100`,
        prompt: likenessReportText(report),
        imagePath: input.imagePath,
      },
    ]);
    return { ok: true, report };
  } catch (e) {
    return toFailure(e);
  }
}
