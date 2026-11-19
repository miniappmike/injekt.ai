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
