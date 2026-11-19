import { describe, expect, it } from "vitest";
import { directorEditPrompt } from "@/lib/ai/prompts/director-edit";

describe("director edit prompt", () => {
  it("always tags her sheets after the uploads when Keep likeness is on", () => {
    const p = directorEditPrompt("edit @image2 to have her body like @image1", true, 3);
    expect(p).toContain("face reference sheet @image4");
    expect(p).toContain("body reference sheet @image5");
  });
  it("adds the line even when the text already names the sheet tags, and only once", () => {
    const once = directorEditPrompt("make @image2 blonde", true, 1);
    expect(once).toMatch(/@image2 and her exact body from her body reference sheet @image3/);
    expect(directorEditPrompt(once, true, 1)).toBe(once);
  });
  it("leaves the text alone with Keep likeness off", () => {
    expect(directorEditPrompt("make it night", false, 2)).toBe("make it night");
  });
});
