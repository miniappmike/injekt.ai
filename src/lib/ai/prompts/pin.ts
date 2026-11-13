/** The check before a generated image is pinned to a character's reference photos: no nudity. */
export const PIN_CHECK_PROMPT = `You check one image before it is saved as a reference photo of a fictional adult character.
Decide only whether it shows nudity: visible genitals, a visible vulva or penis, a visible anus, or visible female nipples or areolae (including through sheer or see-through clothing). Swimwear, lingerie, underwear, cleavage, bare backs, bare legs and implied or covered nudity are fine; only what is actually visible counts.
Reply with only JSON: {"nudity": true or false, "reason": "a few words naming what is visible, or empty"}`;

/** Reads the check's reply. Anything unreadable counts as not cleared, so nothing is pinned on a guess. */
export function parsePinCheck(r: unknown): { clear: boolean; reason: string } {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  if (o.nudity === false) return { clear: true, reason: "" };
  return { clear: false, reason: typeof o.reason === "string" ? o.reason.slice(0, 120) : "" };
}
