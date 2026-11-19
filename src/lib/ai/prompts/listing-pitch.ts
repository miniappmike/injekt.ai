import { fence } from "./rules";

/**
 * "Fill from her profile" on a marketplace listing: the AI reads her header (the one-line description on her character
 * page, plus her name and lore) and writes a niche tagline ("AI Gamer", "AI Traveler") and a short social-media bio.
 */

/** The bio's hard limit (owner: 50 characters or less). */
export const PITCH_BIO_MAX = 50;
/** The tagline is "AI" plus one or two words. */
export const PITCH_TAGLINE_MAX = 24;

export function listingPitchPrompt(o: { name: string; header: string; lore?: string | null }): string {
  return `You name and pitch AI influencer personas for a marketplace.

PERSONA
Name: <<<${fence(o.name).slice(0, 60)}>>>
Her profile header: <<<${fence(o.header).slice(0, 600)}>>>${o.lore ? `\nHer backstory: <<<${fence(o.lore).slice(0, 500)}>>>` : ""}

TASK
From the vibe her header gives off (her look, style and energy), pick the niche she would post about and write:
- "tagline": "AI" followed by one or two words naming that niche, for example "AI Gamer", "AI Traveler", "AI Model", "AI Fitness", "AI Alt Girl", "AI Cosplay", "AI Beach Babe", "AI Fashion". Title case, no punctuation.
- "bio": a short social-media bio in her voice, like an Instagram bio line: at most ${PITCH_BIO_MAX} characters including spaces, one or two emoji allowed, no hashtags, no quotes, no age.
She is an adult woman. Never describe a minor.

Reply with only JSON: {"tagline": "...", "bio": "..."}`;
}

/** Cuts to n characters (an emoji counts as one and is never split), at a word break where there is one. */
const cutWords = (s: string, n: number) => {
  const chars = Array.from(s);
  if (chars.length <= n) return s;
  const head = chars.slice(0, n + 1).join("");
  const at = head.lastIndexOf(" ");
  return (at > head.length / 2 ? head.slice(0, at) : chars.slice(0, n).join("")).replace(/[\s,;:.-]+$/, "");
};

/** The model's reply, made safe: an "AI ..." tagline and a bio within the limit. Empty strings when unusable. */
export function parseListingPitch(raw: unknown): { tagline: string; bio: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as { tagline?: unknown; bio?: unknown };
  const clean = (v: unknown) => String(v ?? "").replace(/[#"“”]/g, "").replace(/\s+/g, " ").trim();
  let tagline = clean(o.tagline).replace(/[.!?,;:]+$/, "");
  if (tagline && !/^AI\b/i.test(tagline)) tagline = `AI ${tagline}`;
  tagline = tagline.replace(/^ai\b/i, "AI");
  return { tagline: cutWords(tagline, PITCH_TAGLINE_MAX), bio: cutWords(clean(o.bio), PITCH_BIO_MAX) };
}
