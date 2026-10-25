/**
 * Every image prompt ends with this, so models aim for a real phone photo instead of a glossy, airbrushed AI look.
 * It is added in code after the model writes a prompt, so it is there even if the model leaves it out.
 */
export const REALISM_LINE =
  "Realistic skin texture. Real smartphone image grain quality. Realistic natural depth, lighting and shadows. " +
  "No overlays or watermarks. No shiny, glossy or waxy skin. Real skin imperfections.";

/** What the prompt-writing models are told, alongside the line itself. */
export const REALISM_INSTRUCTIONS = `Write for a real, candid smartphone photo, not a polished studio or AI render: never describe skin as flawless, smooth,
glowing, airbrushed, glossy or porcelain, and avoid words like "cinematic", "hyper-detailed", "8k" or "professional photoshoot". End every prompt with
exactly this sentence group: "${REALISM_LINE}"`;

/** Adds the realism line to a prompt once (a prompt that already ends with it is left alone). */
export function withRealism(prompt: string): string {
  const p = prompt.trim();
  if (!p) return p;
  if (p.toLowerCase().includes(REALISM_LINE.slice(0, 40).toLowerCase())) return p;
  return `${p}${/[.!?]$/.test(p) ? "" : "."} ${REALISM_LINE}`;
}
