/** Direct swap (artifact A14b swapPrompt), word for word; no screening call runs before it in Model Spawn. */
import { fence, joinTags, OVERLAY_RULE, SKIN_ART_SHORT, TEXT_SHORT } from "./rules";
import { outfitLock, pickAnchors, type RefSet } from "./identity";

const bodyRefTags = (kinds: string[], tags: string[]) => joinTags(kinds.map((k, i) => (k === "body" || k === "side" ? tags[i] : null)).filter((x): x is string => !!x));

/** @image1 is the target photo; her references follow as @image2 onwards. `extra` is added only if it fits in `plen`. */
export function swapPrompt(R: RefSet, o: { who?: string; extra?: string; frame?: string; clean?: boolean; plen: number }): string {
  const who = fence(o.who ?? "").trim();
  const extra = fence(o.extra ?? "").trim();
  const tags = R.roles.map((_, i) => "@image" + (i + 2));
  const ref = joinTags(tags);
  const roles = tags.map((t, i) => `${t} is ${R.roles[i]}`).join(", ");
  const bodyRef = bodyRefTags(R.kinds, tags) || ref;
  const an = R.anchors ? pickAnchors(R.anchors, o.frame) : null;
  const body = an ? [an.upper, an.mid, an.legs].filter(Boolean).join("; ") : "";
  const avoid = an ? (an.avoid || []).map((x) => x.replace(/^not\s+/i, "")) : [];
  let t = `Replace the ${who ? `person ${who}` : "person"} in @image1 with the woman from ${ref}. ${roles}${tags.length > 1 ? "; they all show the same woman" : ""}. Copy her exact face, features, skin tone, marks and hair colour${an && an.hair ? ` (hair: ${an.hair})` : ""}. Her body must match ${bodyRef} exactly: same build, shoulders, bust, waist, hips, glutes, legs and proportions${body ? ` (${body})` : ""}; never keep the original person's body shape, tattoos, piercings or marks; she has only her own. ${SKIN_ART_SHORT}${avoid.length ? ` Not: ${avoid.join("; ")}.` : ""}${outfitLock(ref, "", R.anchors?.sheetOutfit, "target")}${o.clean ? " " + OVERLAY_RULE : ""} Keep everything else in @image1 exactly: pose, expression, outfit, props, background, lighting, framing and camera look. Take only the person from ${ref}, never ${tags.length > 1 ? "their" : "its"} layout, panels or background. It must look like a real unedited phone photo: matte textured skin with pores and small imperfections, slight softness and noise like a real camera; never glossy, waxy, airbrushed or plastic. If @image1 is a drawing or render, make it a real photograph. ${TEXT_SHORT} Garbled or unreadable text in @image1 becomes short, clean generic wording or a plain design.`;
  if (extra) {
    const room = o.plen - t.length - 2;
    if (room > 20) t += " " + extra.slice(0, room);
  }
  return t.slice(0, o.plen);
}
