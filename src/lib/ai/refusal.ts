import { UserFacingError } from "@/lib/errors";

/**
 * Whether the text model declined instead of doing the task ("I'm not able to write this prompt..."). A refusal must
 * never be used as a result: the app would wrap it in her identity and realism lines and the image model would invent an
 * unrelated picture. Looks only at the opening, where a refusal always sits; a JSON or list answer is never one.
 */
export function looksLikeRefusal(text: string): boolean {
  const t = String(text).trim();
  if (/^[{[]/.test(t)) return false;
  const head = t.replace(/\s+/g, " ").slice(0, 600);
  return /\b(?:I(?:'m| am) (?:not able|unable|not going)|I can(?:'|no)t|I (?:won't|will not|must decline|have to decline)|I'm sorry,? but|I apologi[sz]e,? but)\b[^.]{0,120}\b(?:write|help|create|produce|recreate|recreating|generate|assist|provide|fulfil|comply|do that|this (?:prompt|request|task))/i.test(head);
}

export const DECLINED_MESSAGE =
  "The text model declined to write a prompt for this photo, so nothing was made and nothing was charged. Try a different target photo, or a different text model on the API keys page.";

/** The model answered with a refusal. Caught where a second model can take over; otherwise shown as is. */
export class ModelDeclinedError extends UserFacingError {
  constructor() {
    super(DECLINED_MESSAGE);
    this.name = "ModelDeclinedError";
  }
}
