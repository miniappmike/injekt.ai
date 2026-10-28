import { harness } from "../prompts/harness";
import type { TaskInput } from "../master-prompt";

/** The artifact's realism rule (from the Inject hard rules), for prompt-writing tasks that are not ported yet. */
export const REALISM_INSTRUCTIONS =
  "REALISM, required in every prompt: (1) a skin sentence: real, unretouched, matte skin with visible pores, fine peach fuzz, uneven tone, faint redness and small natural imperfections, using the profile's skin tone and marks, plus a few flyaway hairs, and never shine, glow or smoothness; (2) a materials sentence: the real texture of the fabrics, surfaces and objects, such as ribbed knit weave, soft fleece, creases, fraying, wood grain, dust; (3) a camera quality sentence matching how the target was captured: device or camera type, focal length look, depth of field, noise or grain, sharpening, dynamic range. Always include real camera imperfections: slight softness and focus falloff away from the face, faint motion blur where something moves, visible noise in the shadows, mild compression and slightly imperfect white balance. A phone photo gets a smartphone main-camera look with those imperfections and true-to-life colour. A film photo gets grain, halation and its colour grade. A green screen or coloured backdrop casts a faint colour spill on the skin and clothes.";

/** Runs a written prompt through the artifact harness, which adds the realism and text lines when they're missing. */
export const withRealism = (prompt: string) => (prompt.trim() ? harness(prompt).text : "");

/** Task builders written as instructions plus details, joined into the one user-turn prompt. */
export const legacyTask = (t: { instructions: string; text: string; images?: string[] }): TaskInput => ({
  prompt: `${t.instructions}\n\n${t.text}`,
  images: t.images,
});
