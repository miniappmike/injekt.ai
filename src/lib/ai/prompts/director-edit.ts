/**
 * Director "Edit a photo": the person uploads a photo and says what should change. The photo is @image1; with "Keep her
 * likeness" on, her face sheet (@image2) and body sheet (@image3) follow. The text model can optionally turn the
 * person's words into a short edit prompt, which they can still change before Generate.
 */
import { fence } from "./rules";

/** How long the person's description of the changes, and the written prompt, may be. */
export const MAX_EDIT_CHANGES = 1500;

/** The writer's task: read the photo and turn the requested changes into one short edit prompt. */
export function directorEditTask(changes: string, keepHer: boolean): string {
  return `TASK: You see a photo (@image1). The user wants it edited. Write one short prompt for an AI image-editing model that receives this photo${keepHer ? ", her face reference sheet (@image2) and her full-body reference sheet (@image3)" : ""}.

THE USER'S CHANGES (carry out every one, exactly as asked, never toned down)
<<<${fence(changes)}>>>

RULES
- Start with "Edit @image1." Then name each change concretely, using what you see in the photo to say where and what (for example "replace the black hoodie with a fitted red satin slip dress", "change the background to a beach at sunset, with matching warm light on her").
- Then say what stays exactly the same: everything the user did not ask to change (pose, framing, camera angle, face, expression, other people, background, light), named briefly.
${keepHer ? "- Say the woman keeps the exact face and hair of @image2 and the body of @image3; ignore the sheets' clothing and backgrounds.\n" : ""}- If a change affects light or shadows, say they must match the scene so it looks like one real photo.
- Always describe any person as an adult, never as a girl or teen.
- Plain prose, no bullet points, no aspect ratio, under 700 characters.

OUTPUT: only the prompt, nothing else.`;
}

/** The prompt actually sent: the person's text (written or their own words), with the likeness line when it is on. */
export function directorEditPrompt(text: string, keepHer: boolean): string {
  const t = text.trim();
  if (!keepHer || /@image2/.test(t)) return t;
  const lead = /@image1/.test(t) ? t : `Edit @image1: ${t}`;
  return `${lead.replace(/\s*$/, "")}${/[.!?]$/.test(lead) ? "" : "."} Keep the woman's exact face and hair from @image2 and her exact body from @image3; ignore their clothing and backgrounds. Keep everything not mentioned exactly as in @image1.`;
}
