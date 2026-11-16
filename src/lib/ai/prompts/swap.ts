/** Direct swap: the fixed prompt that puts her into a photo, with no prompt-writing call before it. */
import { fence } from "./rules";
import { swapCore, type RefSet } from "./identity";

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
