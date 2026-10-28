import { SCOPE } from "./prompts/rules";

export interface TaskInput {
  /** The task, as one user-turn string. The SCOPE guard is always put in front of it. */
  prompt: string;
  /** Image data URIs, in the order the prompt refers to them ("the first attached image" and so on). */
  images?: string[];
}

// As in the artifact there is no system prompt: SCOPE opens the user turn, then a blank line, then the task.
export const withScope = (prompt: string) => `${SCOPE}\n\n${prompt}`;
