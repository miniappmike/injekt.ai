import { describe, expect, it } from "vitest";
import { dropBlanketMarks, harness } from "@/lib/ai/prompts/harness";

describe("blanket tattoo and piercing exclusions", () => {
  it("drops blanket items from an exclusion list and keeps specific ones", () => {
    expect(dropBlanketMarks("EXCLUSIONS: no navel piercing, no tattoos, no piercings, no text, no watermarks.")).toBe("EXCLUSIONS: no navel piercing, no text, no watermarks.");
    expect(dropBlanketMarks("Exclusions: no tattoos or piercings, no text.")).toBe("Exclusions: no text.");
    expect(dropBlanketMarks("Scene.\n\nEXCLUSIONS: no tattoos.\n")).toBe("Scene.");
  });

  it("leaves sentences and specific negatives alone", () => {
    const s = "She has a small rose tattoo on her ankle. Add no tattoos or piercings she lacks. No navel piercing.";
    expect(dropBlanketMarks(s)).toBe(s);
  });

  it("runs on every written prompt", () => {
    const h = harness("She stands by the tree, pores visible, denim texture, shot on a camera. EXCLUSIONS: no tattoos, no text, gibberish-free.", { realism: false, text: false });
    expect(h.text).not.toMatch(/no tattoos/);
    expect(h.fixed).toContain("kept her own tattoos and piercings");
  });
});

describe("skin wording", () => {
  const run = (t: string) => harness(t, { realism: false, text: false }).text;

  it("keeps a negated plastic-skin word as written, instead of turning it into its opposite", () => {
    expect(run("Real skin with pores. No navel piercing, no glossy skin.")).toContain("no glossy skin");
    expect(run("Never smooth skin or a beauty filter.")).toContain("Never smooth skin");
  });

  it("still fixes plastic-skin wording that isn't negated", () => {
    expect(run("Her flawless skin catches the light.")).toContain("natural textured skin");
  });

  it("turns matte skin into natural skin texture", () => {
    expect(run("Real matte skin with pores, uneven tone.")).toBe("Real naturally textured skin with pores, uneven tone.");
    expect(run("Skin is matte and textured, with pores.")).toBe("Skin has natural texture, with pores.");
    expect(run("She wears nude matte lips and a matte black dress.")).toContain("matte lips and a matte black dress");
  });
});
