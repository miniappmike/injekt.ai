import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { withBothSheets } from "@/lib/inject-run";
import { harness } from "@/lib/ai/prompts/harness";
import { hasQualityLine, REALISM_FIX } from "@/lib/ai/prompts/rules";
import { sceneText } from "@/lib/ai/prompts/identity";
import { TWO_SHEET_OPENER } from "@/lib/ai/prompts/inject";

// The camera passage from a real written prompt, which already says everything the IMAGE QUALITY line says.
const LOOK =
  "CAMERA AND LOOK: Shot on a smartphone main camera with a slight telephoto look, shallow depth of field keeping the face sharp with gentle falloff at the edges, real matte skin with visible pores, faint redness and fine peach fuzz, a few flyaway hairs, mild noise in the shadows, slight compression and a natural colour grade.";
const WRITTEN = `Use @image1 as the strict identity reference. Photo of a young woman on a carpet. She has a curvy hourglass figure; the body must match the reference exactly with no slimming, enlarging or idealising.\n\nWARDROBE: a glossy black vinyl mini skirt and red patent leather gloves.\n\n${LOOK}\n\nno garbled or made-up lettering.`;

describe("Inject prompts with both sheets", () => {
  it("open on both sheets and point the body line at @image2", () => {
    const t = withBothSheets(WRITTEN);
    expect(t.startsWith(TWO_SHEET_OPENER + " Photo of a young woman")).toBe(true);
    expect(t).toContain("the body must match @image2 exactly");
    expect(withBothSheets(t)).toBe(t);
  });

  it("the framing still recognises and replaces the two-sheet opener", () => {
    expect(sceneText(withBothSheets(WRITTEN), 2).startsWith("Photo of a young woman")).toBe(true);
  });

  it("a camera-and-look passage counts as the quality line, and vinyl or patent counts as texture", () => {
    expect(hasQualityLine(LOOK)).toBe(true);
    const h = harness(WRITTEN, { tag: "@image1" });
    expect(h.text).not.toContain(REALISM_FIX.quality);
    expect(h.text).not.toContain(REALISM_FIX.texture);
    expect(h.fixed).toEqual([]);
  });
});
