/** Direct swap: the fixed prompt that puts her into a photo, with no prompt-writing call before it. */
import { fence, joinTags, OVERLAY_RULE } from "./rules";
import { swapCore, type RefSet } from "./identity";
import { paragraphs, sentences } from "./lean";

/** @image1 is the target photo; her references follow as @image2 onwards. `extra` is added only if it fits in `plen`. */
export function swapPrompt(R: RefSet, o: { who?: string; extra?: string; frame?: string; clean?: boolean; plen: number }): string {
  const extra = fence(o.extra ?? "").trim();
  let t = swapCore(R, { who: o.who, frame: o.frame, keep: ["pose", "expression", "outfit", "props", "background", "light and shadows", "framing", "camera look"], clean: o.clean });
  if (extra) {
    const room = o.plen - t.length - 2;
    if (room > 20) t += " " + extra.slice(0, room);
  }
  return t.slice(0, o.plen);
}

const one = (s: string | undefined, n: number) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^none\.?$/i, "")
    .slice(0, n)
    .replace(/[.;,\s]+$/, "");

const LEAN_BODY = "entire body likeness (chest, shoulders, waist, hips, glutes and legs)";

/** What a lean swap says besides the recipe: the camera and pose read from the target, and what the version changes. */
export interface LeanSwapOptions {
  who?: string;
  /** Where the camera is and the lens look, as read from the target. */
  camera?: string;
  /** The pose as read from the target, or the new pose when `poseChanges`. */
  pose?: string;
  change?: string;
  poseChanges?: boolean;
  outfitChanges?: boolean;
  hairChanges?: boolean;
  clean?: boolean;
}

/**
 * Inject's "Swap into photo", the owner's short recipe: her references lead (@image1 face sheet, @image2 body sheet)
 * and the target photo is the LAST image. One sentence says what to take from each image, one what stays, then the
 * camera and pose in the writer's words, then skin. No identity block: the sheets carry her look.
 */
export function leanSwap(R: RefSet, o: LeanSwapOptions = {}): string {
  const n = R.roles.length;
  const tags = R.roles.map((_, i) => "@image" + (i + 1));
  const target = "@image" + (n + 1);
  const isFace = (k: string) => k === "faces" || k === "front";
  const isBody = (k: string) => k === "body" || k === "side";
  const split = R.kinds.some(isFace) && R.kinds.some(isBody);
  const take = split
    ? joinTags(
        tags.map((t, i) => (isFace(R.kinds[i]) ? `the exact face and hair of ${t} (face reference)` : isBody(R.kinds[i]) ? `the ${LEAN_BODY} of ${t} (body reference)` : `the same woman in ${t}`)),
      )
    : `the exact face, hair and ${LEAN_BODY} of the woman in ${joinTags(tags)}`;
  const who = one(fence(o.who), 60);
  const keep = [!o.poseChanges && "pose", !o.outfitChanges && "outfit", !o.hairChanges && "hairstyle", "background", "light", "camera angle", "framing", "image quality"].filter(Boolean).join(", ");
  const camera = one(o.camera, 320);
  const pose = one(o.pose, 520);
  const change = one(o.change, 600);
  return paragraphs(
    sentences(
      `Replace the person${who ? ` (${who})` : ""} in ${target} (target photo) with ${take}.`,
      "Her body keeps its real size and shape, never slimmed or averaged, with none of the original person's tattoos or piercings.",
    ),
    `Keep everything else in ${target} exactly: ${keep}. Ignore the clothing and backgrounds in ${joinTags(tags)}.`,
    camera && `Camera: ${camera}.`,
    pose && `${o.poseChanges ? "New pose" : "Pose"}: ${pose}.`,
    change && `Change: ${change}.`,
    sentences(
      "Realistic, imperfect skin: visible pores, uneven tone, small blemishes and fine body hair. No smooth, glossy or airbrushed skin.",
      o.clean && OVERLAY_RULE,
    ),
  );
}
