import { describe, expect, it } from "vitest";
import { directorEditPrompt, directorEditTask } from "@/lib/ai/prompts/director-edit";

describe("Director edit a photo", () => {
  it("frames plain words with the photo and, when on, her sheets", () => {
    expect(directorEditPrompt("make it night", false)).toBe("make it night");
    const p = directorEditPrompt("make it night", true);
    expect(p).toMatch(/^Edit @image1: make it night\./);
    expect(p).toContain("@image2");
    expect(p).toContain("@image3");
  });
  it("tells the writer about the sheets only when they are sent", () => {
    expect(directorEditTask("red dress", true)).toContain("@image3");
    expect(directorEditTask("red dress", false)).not.toContain("@image3");
  });
});
