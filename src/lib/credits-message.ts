/** What to say when there aren't enough tokens. Kept beside the pattern that recognises it, so the two can't drift. */
export function creditsMessage(e: { needed: number; balance: number }): string {
  return `This needs ${e.needed} token${e.needed === 1 ? "" : "s"} and you have ${e.balance}. Buy more on the Tokens page (profile menu → Tokens).`;
}

/** Reads the numbers back out of a message made by `creditsMessage`, or null when it is some other message. */
export function parseCreditsMessage(text: string | null | undefined): { needed: number; balance: number } | null {
  const m = /^This needs (\d+) tokens? and you have (\d+)\./.exec(text ?? "");
  return m ? { needed: Number(m[1]), balance: Number(m[2]) } : null;
}
