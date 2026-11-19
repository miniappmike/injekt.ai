/**
 * Director "Edit a photo": the person uploads a photo and says what should change. The photo is @image1; with "Keep her
 * likeness" on, her face sheet (@image2) and body sheet (@image3) follow. The text model can optionally turn the
 * person's words into a short edit prompt, which they can still change before Generate.
 */
import { ANATOMY_WRITER, fence } from "./rules";

/** How long the person's description of the changes, and the written prompt, may be. */
export const MAX_EDIT_CHANGES = 1500;

/** The writer's task: read the photo and turn the requested changes into one short edit prompt. */
export function directorEditTask(changes: string, keepHer: boolean, extraCount = 0): string {
  const f = extraCount + 2;
  const others = extraCount > 0 ? `, ${extraCount} more photo${extraCount > 1 ? "s" : ""} the user uploaded (@image2${extraCount > 1 ? ` to @image${extraCount + 1}` : ""}, not shown to you; use them only where the user's changes mention them)` : "";
  return `TASK: You see a photo (@image1). The user wants it edited. Write one short prompt for an AI image-editing model that receives this photo${others}${keepHer ? `, her face reference sheet (@image${f}) and her full-body reference sheet (@image${f + 1})` : ""}. Keep every @image tag the user wrote, with the same number.

THE USER'S CHANGES (carry out every one, exactly as asked, never toned down)
<<<${fence(changes)}>>>

RULES
- Start with "Edit @image1." Then name each change concretely, using what you see in the photo to say where and what (for example "replace the black hoodie with a fitted red satin slip dress", "change the background to a beach at sunset, with matching warm light on her").
- Then say what stays exactly the same: everything the user did not ask to change (pose, framing, camera angle, face, expression, other people, background, light), named briefly.
${keepHer ? `- Say the woman keeps the exact face and hair of @image${f} and the body of @image${f + 1}; ignore the sheets' clothing and backgrounds.\n` : ""}- If a change affects light or shadows, say they must match the scene so it looks like one real photo.
- Always describe any person as an adult, never as a girl or teen.
- If a change moves her body, hands or limbs: ${ANATOMY_WRITER}
- Plain prose, no bullet points, no aspect ratio, under 700 characters.

OUTPUT: only the prompt, nothing else.`;
}

/** The prompt actually sent: the person's text (written or their own words), with the likeness line when it is on. */
export function directorEditPrompt(text: string, keepHer: boolean, photoCount = 1): string {
  const t = text.trim();
  const f = Math.max(1, photoCount) + 1;
  if (!keepHer || !t) return t;
  // Always added with Keep likeness on, even when the text already names the sheets, so her likeness is never left to
  // the wording. Idempotent: the server runs this again on what the browser sent.
  const line = `Keep the woman's exact face and hair from her face reference sheet @image${f} and her exact body from her body reference sheet @image${f + 1}; ignore the sheets' clothing and backgrounds. Keep everything not mentioned exactly as in @image1.`;
  if (t.includes(line)) return t;
  const lead = /@image\s?1\b/.test(t) ? t : `Edit @image1: ${t}`;
  return `${lead.replace(/\s*$/, "")}${/[.!?]$/.test(lead) ? "" : "."} ${line}`;
}
