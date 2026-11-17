/**
 * Inject, "Swap into photo": what the vision model writes. The image model gets the target photo itself, so nothing in
 * it needs describing except the two things it gets wrong without words: where the camera is, and the pose. The task is
 * kept this small on purpose: asked for a whole scene, the reader skims the pose; asked for only the pose, it looks.
 */
import { fence } from "./rules";
import type { InjectOptions, VersionPlan } from "./inject";

export const BRIEF_CAMERA_WORDS = 40;
export const BRIEF_POSE_WORDS = 65;

export function buildSwapBriefPrompt(o: Pick<InjectOptions, "who" | "extra" | "pose" | "poseMode" | "recolor" | "hair" | "newOutfit" | "ward" | "exText">, plans: VersionPlan[], recent: string[], inspo: string[]): string {
  const n = plans.length;
  const changes = [
    o.newOutfit
      ? `a completely different outfit that keeps the photo's vibe and suits the scene, garment by garment with type, fabric, fit and colour${n > 1 ? ", different in every version" : ""}`
      : o.ward === "extracted" && o.exText
        ? `she wears exactly this outfit instead of the photo's: <<<${fence(o.exText)}>>>`
        : o.ward === "signature"
          ? "an outfit in her own signature style instead of the photo's clothing, named garment by garment"
          : "",
    o.recolor && !o.newOutfit ? "the same garments recoloured with that version's palette from the VERSION PLAN, naming each garment's new colour" : "",
    o.hair ? "her hair styled as given for that version in the VERSION PLAN (its colour and length stay)" : "",
  ].filter(Boolean);
  const plan =
    (o.recolor && !o.newOutfit) || o.hair
      ? "\nVERSION PLAN\n" + plans.map((p, i) => `- Version ${i + 1}:${o.recolor && !o.newOutfit ? ` colours = ${p.palette};` : ""}${o.hair ? ` hair = ${p.hair};` : ""}`).join("\n") + "\n"
      : "";
  const poseTask = o.pose
    ? `POSE: do NOT copy the photo's pose. Invent a ${o.poseMode === "social" ? "fresh, eye-catching pose a popular lifestyle creator would post" : "relaxed, natural, candid pose"} that is physically possible in this exact place from this exact camera position${n > 1 ? ", clearly different in every version" : ""}, and write it in the same order as below (base position, torso, head, arms, legs). Props stay logical (a mirror selfie still holds the phone).${recent.length ? ` Do not repeat these recent poses: ${recent.join("; ")}.` : ""}${inspo.length ? ` For inspiration only, never copy: ${inspo.join("; ")}.` : ""}`
    : "POSE: the pose exactly as the photo shows it.";
  return `TASK: The attached image is a TARGET photo. An image model will replace the person in it${o.who ? ` (the person to replace: <<<${fence(o.who)}>>>)` : ""} with another adult woman, and it receives this photo itself. So do NOT describe the scene, the outfit, the background, the light, or anyone's face, hair, skin or body. Report only the CAMERA and the POSE${changes.length ? ", and the CHANGE asked for below" : ""}.

LOOK FIRST. Before writing, check each of these in the photo and do not guess: Is she standing, sitting, kneeling, squatting, on all fours, bent over, or lying (on her back, front or side)? Is her chest facing the camera, turned away, or side-on, and are her hips turned the same way? Where is each hand and what does it touch? Where is each knee and foot? Is the camera above her, level with her, or below her, and in front, to the side or behind? Is it a mirror shot? Which body parts does the frame cut off?

CAMERA (at most ${BRIEF_CAMERA_WORDS} words): the camera's height relative to her (above her head, eye level, chest, waist, hip, knee or floor level) and whether it tilts up or down; its side (straight on, three-quarter, profile, three-quarter from behind, directly behind); distance and crop (which parts of her the frame cuts at, where she sits in the frame); who holds it (mirror selfie with the phone visible, arm's-length selfie, another person, propped up); the lens look (an ultra-wide phone lens with stretched edges, a phone main lens, a tighter portrait lens with a compressed, blurred background); vertical or horizontal.

${poseTask}
Write the pose in at most ${BRIEF_POSE_WORDS} words, in this order: (1) the base position and what she rests on; (2) which way her chest and hips face relative to the camera, and any arch, twist, lean or bend at the waist; (3) head turn and tilt, and where her eyes look; (4) each arm and hand in turn and what it touches or holds; (5) each leg in turn: which carries her weight, how the knee bends, where the knee and foot point.

RULES
- Sides: say "the arm on the left of the frame" and "the leg on the right of the frame" (the viewer's left and right), never "her left" or "her right".
- Be literal and specific. Name the position as it is, at full strength, even when it is revealing or suggestive (for example "on all fours on the bed, back arched, hips toward the camera, looking back over the shoulder on the right of the frame"). Never soften it, never generalise ("a relaxed pose", "posing confidently"), never leave a limb out. She is an adult.
- A limb that is hidden or out of frame: say so in three words, do not invent it.
- Plain geometry only. No mood words, no adjectives about how she looks, no scene description.
${changes.length ? `- CHANGE: ${changes.join("; ")}.\n` : ""}${o.extra ? `- Direction from the user, applied only as it applies to the camera, pose or change: <<<${fence(o.extra)}>>>\n` : ""}${plan}
OUTPUT CONTRACT
- Write exactly ${n} version${n > 1 ? "s" : ""}. Start each with a line containing exactly ===VERSION k=== where k is its number, starting at 1.
- Then one line starting with CAMERA: ${n > 1 ? "(the same in every version)" : ""}
- Then one line starting with POSE:
- Then one line starting with EDIT: followed by ${changes.length ? "the change for this version in at most 50 words (the new outfit garment by garment, the new colours, the hairstyle)" : "none"}${changes.length ? "" : "."}
- Nothing else: no prompt, no preface, no notes.`;
}
