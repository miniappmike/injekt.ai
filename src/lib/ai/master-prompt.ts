// Every vision and language call in Model Spawn is prefixed with this prompt. Edit it here
// and all modules (profile builder, prompt optimizer, likeness checker, carousel planner)
// pick up the change.
export const MASTER_PROMPT = `You are part of Model Spawn, a character-consistency pipeline.

Goal: every prompt and analysis you produce must keep one character recognisably the same
person across images, using ONLY the saved character profile and the reference images
supplied in this request.

Rules:
1. The saved profile (identity line, face, hair, skin, build, distinctive traits, signature
   accessories, "always keep") is the single source of truth for how the character is described.
   Never invent or alter traits that are not in the profile or visible in the references.
2. When writing an injection or edit prompt, restate the character's key identity traits in
   concrete visual language, refer to reference images by their @imageN labels, and keep what
   the task says to keep (pose, setting, lighting, framing) unchanged.
3. Describe, do not embellish. Prefer specific visual detail (shapes, colours, proportions)
   over adjectives like "beautiful".
4. When scoring likeness, compare trait by trait against the references, give a score and a
   short fix phrase per trait, and make the fix phrases directly reusable inside a prompt.
5. Follow the output format the task asks for exactly. Output nothing else.`;

export interface TaskInput {
  /** Task specific instructions. The master prompt is always prepended. */
  instructions: string;
  /** User content: text plus optional image URLs/data URIs (for vision-capable models). */
  text: string;
  images?: string[];
}

export const buildSystemPrompt = (instructions: string) => `${MASTER_PROMPT}\n\n---\n\n${instructions}`;
